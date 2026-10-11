"""Smart Food Bank Fridge - Gemini vision for the donation camera.

Gives Nourish eyes: plugs into the two camera hooks on FridgeVoiceAgent.

    vision = GeminiVision(camera.get_frame)
    agent.set_item_scanner(vision.identify_item)     # "2 sealed cans of black beans"
    agent.set_expiry_scanner(vision.read_expiry)     # "BEST BY 03/12/2028"

Both scanners are *active*: the agent calls them the moment it finishes asking,
before the donor has moved. Gemini's free tier allows only ~5 requests a
minute per model, so we cannot simply stream frames at it. Instead a cheap
local check watches the webcam for "something was brought into view and is now
being held still", and only that frame is sent. A scan normally costs one
request; on a rate limit it moves to the next model, which has its own quota.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Callable, Optional

import cv2
import numpy as np
from google import genai
from google.genai import errors, types

log = logging.getLogger("fridge.vision")

# Tried in order; each model has its own per-minute quota. Item recognition is
# the harder task so it gets the strongest model first, and date reading starts
# on a different one so the two steps of a donation don't share a quota.
# gemini-3.8-flash reads items best but the free tier allows it only 20
# requests a DAY, so it is the reserve, not the default.
ITEM_MODELS = ["gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
EXPIRY_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.7-flash"]
RATE_LIMIT_COOLDOWN_S = 30.0  # used when the error does not say how long to wait

# The agent's tool call times out at 20 s; leave room for one last request.
SCAN_TIMEOUT_S = 14.0
MAX_REQUESTS_PER_SCAN = 3
REQUEST_TIMEOUT_MS = 10_000  # the API rejects deadlines shorter than 10 s

# Local "is something being held up?" check, on a small blurred grayscale frame.
NO_CHANGE_WAIT_S = 2.5  # nothing moved (item was already in view?): send a frame anyway
SETTLE_MAX_S = 3.0  # something moved but never held still: send anyway
STILL_FOR_S = 0.4  # how long the picture must be steady before we shoot
CHANGED_PIXEL_FRACTION = 0.04  # vs. the frame at scan start
MOVING_PIXEL_FRACTION = 0.015  # vs. the previous frame

ITEM_PROMPT = """\
You are the camera of a community food-donation fridge. A donor may be holding a food item up to the camera.
Report only an item that is clearly being held up or presented in the foreground. Ignore people, hands, \
clothing, furniture and anything in the background. If nothing is being presented, set item_visible to false.
- food: short common name with the packaging, e.g. "canned black beans", "bottle of orange juice", "loaf of bread". \
Include the brand only if you can read it.
- count: how many separate units of that item are being held up.
- sealed: true if the packaging looks unopened, false if it looks opened or damaged."""

EXPIRY_PROMPT = """\
You are the camera of a community food-donation fridge. A donor is showing the expiration date printed on a food package.
Find a printed expiration / best-by / use-by / sell-by date. If you cannot read one with confidence, set \
date_visible to false; never guess digits.
- date_text: the date exactly as printed, including its label if present, e.g. "BEST BY 03/12/2028" or "EXP 2027 JUN 01"."""

PRODUCT_PROMPT = """\
You are the camera of a community food-donation fridge. Describe the food product being held up, as precisely \
as the picture and the label text allow. Ignore people, hands and the background.
Fill a field only when the image or the label text supports it; otherwise leave it null. Never guess a brand, \
flavour or size from general appearance, and never invent one.
- brand: e.g. "Red Bull".
- product_name: the product without the brand, e.g. "energy drink", "black beans".
- variant: flavour or line, e.g. "Zero", "Sugarfree", "low sodium".
- size: net contents exactly as printed, e.g. "8.4 fl oz (250 mL)", "15 oz".
- container: can, bottle, jar, box, bag, carton, pouch, or "loose" for unpackaged produce.
- category: a short grocery category, e.g. "energy drinks", "canned beans", "fresh fruit".
- storage: "shelf-stable", "refrigerate" or "frozen", only if printed on the pack or obvious for this kind of product.
- count: how many separate units are being held up.
- sealed: true if the packaging looks unopened, false if opened or damaged."""

PRODUCT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "item_visible": {"type": "BOOLEAN"},
        "brand": {"type": "STRING", "nullable": True},
        "product_name": {"type": "STRING", "nullable": True},
        "variant": {"type": "STRING", "nullable": True},
        "size": {"type": "STRING", "nullable": True},
        "container": {"type": "STRING", "nullable": True},
        "category": {"type": "STRING", "nullable": True},
        "storage": {"type": "STRING", "nullable": True},
        "count": {"type": "INTEGER", "nullable": True},
        "sealed": {"type": "BOOLEAN", "nullable": True},
    },
    "required": ["item_visible"],
}

WEB_LOOKUP_PROMPT = """\
A donor is holding up the food product in this image. Use Google Search to find this exact product (same brand, \
variant and size) and report what reliable pages say about it. Start from what is already known:
{known}
Reply with ONLY a JSON object with these keys, using null where the search does not clearly support a value:
"brand", "product_name", "variant", "size", "category", "storage" (shelf-stable / refrigerate / frozen),
"description" (one sentence), "ingredients_summary" (one short sentence, only if a page lists them),
"summary" (one short sentence naming the exact product, for a voice assistant to say).
Do not guess, and do not include image links."""

# Shelf audits run all day, so they use the lighter models and leave the
# stronger ones' small daily allowance for donors standing at the fridge.
AUDIT_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.7-flash", "gemini-3.5-flash"]

AUDIT_PROMPT = """\
This picture comes from the second camera of a community food-donation fridge. Your job is simply to look for \
the items listed below in whatever the picture shows. It does not have to look like a fridge or a shelf: the \
items may be on a table, in someone's hand, or held up to the camera. Just look for them.

Items that were scanned in (name, count):
{expected}

1. image_usable: true whenever anything at all can be made out. Set it to false ONLY if the picture is \
completely black, completely blank, or so blurred that nothing can be recognised, and say why in image_problem.
2. expected: for EVERY item in the list above, how many you can see (seen_count). Keep each name exactly as given.
   Match by what kind of thing it is, generously. The same product often looks different from one picture to \
the next: another brand, label design, size, bottle shape or angle. If "water" was scanned in and you see a \
bottle of water of any brand, that is the item. A can of cola counts for "Coke"; a box of oat cereal counts for \
"Cheerios cereal". Only report 0 when nothing of that kind is in the picture. Use null only when you truly \
cannot tell, for example because it would be hidden behind something.
3. unexpected: food or drink you can see that is not any kind of item in the list above, with a count. Do not \
list something here that you already counted as a match in step 2.
4. spill_detected: true if there is spilled liquid, leaked or broken packaging, loose food or a visible mess. \
Describe it in spill_description (what and where).
5. summary: one plain sentence describing the food and drink in the picture."""

AUDIT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "image_usable": {"type": "BOOLEAN"},
        "image_problem": {"type": "STRING", "nullable": True},
        "expected": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING"},
                    "seen_count": {"type": "INTEGER", "nullable": True},
                },
                "required": ["name"],
            },
        },
        "unexpected": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"name": {"type": "STRING"}, "count": {"type": "INTEGER"}},
                "required": ["name", "count"],
            },
        },
        "spill_detected": {"type": "BOOLEAN"},
        "spill_description": {"type": "STRING", "nullable": True},
        "summary": {"type": "STRING"},
    },
    "required": ["image_usable"],
}

SAME_PRODUCT_PROMPT = """\
The first image is a live camera frame of a food item a donor is holding up. The second image is a product \
photo from an online catalog. Decide whether the catalog photo shows the same product as the one being held: \
same brand, same product and same variant or flavour. A different pack size or an older label design still \
counts as the same product. If the held item is not clear enough to tell, answer "unsure"."""

SAME_PRODUCT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "verdict": {"type": "STRING", "enum": ["same", "different", "unsure"]},
        "reason": {"type": "STRING"},
    },
    "required": ["verdict"],
}

ITEM_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "item_visible": {"type": "BOOLEAN"},
        "food": {"type": "STRING"},
        "count": {"type": "INTEGER"},
        "sealed": {"type": "BOOLEAN"},
    },
    "required": ["item_visible"],
}

EXPIRY_SCHEMA = {
    "type": "OBJECT",
    "properties": {"date_visible": {"type": "BOOLEAN"}, "date_text": {"type": "STRING"}},
    "required": ["date_visible"],
}


def _changed_fraction(a: np.ndarray, b: np.ndarray, threshold: int) -> float:
    """Fraction of pixels that differ by more than `threshold` grey levels."""
    return float(np.count_nonzero(cv2.absdiff(a, b) > threshold)) / a.size


class GeminiVision:
    def __init__(
        self,
        get_frame: Callable[[], Optional[np.ndarray]],
        api_key: Optional[str] = None,
    ):
        """`get_frame` returns the newest webcam frame (BGR) or None, e.g. `Camera.get_frame`."""
        self._get_frame = get_frame
        self._client = genai.Client(
            api_key=api_key or os.environ["GEMINI_API_KEY"],
            http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS),
        )
        self._cooling_until: dict[str, float] = {}  # model -> monotonic time its quota should be back
        # Google Search grounding is not included in the free tier. We find out
        # on the first attempt and stop asking for the rest of the run.
        self.web_search_available = os.getenv("GEMINI_WEB_SEARCH", "auto").lower() != "off"

    # -- scanner hooks -------------------------------------------------------
    def identify_item(self, hint: str = "", frame: Optional[np.ndarray] = None) -> str:
        """Watch until a food item is held up; return e.g. "2 sealed cans of black beans"."""
        prompt = ITEM_PROMPT
        if hint:
            prompt += f'\nThe donor said it is: "{hint}". Trust what you see over what they said.'

        def accept(result: dict) -> Optional[str]:
            if not result.get("item_visible") or not result.get("food"):
                return None
            count = max(1, int(result.get("count") or 1))
            state = {True: "sealed", False: "opened or damaged"}.get(result.get("sealed"), "")
            return f"{count} x {result['food']}" + (f" ({state})" if state else "")

        return self._scan(prompt, ITEM_SCHEMA, accept, ITEM_MODELS, max_width=1024, frame=frame)

    def identify_frame(self, frame: np.ndarray, hint: str = "") -> str:
        """One request about one frame (used as the backup for on-device vision)."""
        return self.identify_item(hint, frame=frame)

    def product_metadata(self, frame: np.ndarray, label_text: str = "", hint: str = "") -> dict:
        """One request: everything specific Gemini can support about the product in this frame.

        Returns {} if no food item is visible. Keys: brand, product_name,
        variant, size, container, category, storage, count, sealed (any may be None).
        """
        prompt = PRODUCT_PROMPT
        if label_text:
            prompt += f"\nText an OCR pass read off the item (may contain errors): {label_text}"
        if hint:
            prompt += f'\nThe donor said it is: "{hint}". Trust what you see over what they said.'
        result = self._ask_with_fallback(prompt, PRODUCT_SCHEMA, frame, ITEM_MODELS, max_width=1280)
        if not result.get("item_visible"):
            return {}
        return {key: value for key, value in result.items() if key != "item_visible" and value not in (None, "")}

    def web_lookup(self, frame: np.ndarray, label_text: str = "", known: Optional[dict] = None) -> dict:
        """Look the product up on the web through Gemini's Google Search tool.

        Returns the fields from WEB_LOOKUP_PROMPT plus "sources": the pages
        the answer was grounded on (real URLs reported by the API, not text
        the model wrote). Raises if web search is not available on this key,
        and remembers that so the next scan does not try again.
        """
        facts = {key: value for key, value in (known or {}).items() if value not in (None, "")}
        if label_text:
            facts["text_on_label"] = label_text
        prompt = WEB_LOOKUP_PROMPT.format(known=json.dumps(facts, ensure_ascii=False) or "nothing yet")
        ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 88])
        if not ok:
            raise RuntimeError("could not encode frame")
        last_error: Optional[Exception] = None
        for model in ITEM_MODELS:
            if time.monotonic() < self._cooling_until.get(model, 0.0):
                continue
            try:
                response = self._client.models.generate_content(
                    model=model,
                    contents=[types.Part.from_bytes(data=jpeg.tobytes(), mime_type="image/jpeg"), prompt],
                    # A JSON schema cannot be combined with the search tool,
                    # so the reply is free text that we parse ourselves.
                    config=types.GenerateContentConfig(
                        tools=[types.Tool(google_search=types.GoogleSearch())], temperature=0
                    ),
                )
            except Exception as exc:
                # One refusal is enough: on the free tier every model refuses
                # search, and asking them all in turn costs seconds per scan.
                last_error = exc
                break
            text = response.text or ""
            start, end = text.find("{"), text.rfind("}")
            try:
                result = json.loads(text[start : end + 1]) if start >= 0 and end > start else {}
            except json.JSONDecodeError:
                result = {}
            result = {key: value for key, value in result.items() if value not in (None, "", [])}
            metadata = response.candidates[0].grounding_metadata if response.candidates else None
            chunks = (metadata.grounding_chunks or []) if metadata else []
            sources = [{"title": chunk.web.title, "url": chunk.web.uri} for chunk in chunks if chunk.web]
            if not sources:
                return {}  # an answer with no pages behind it is just the model talking
            result["sources"] = sources[:5]
            log.info("web lookup (%s): %s", model, result)
            return result
        # Every model refused: on the free tier that means "no search for you".
        self.web_search_available = False
        raise RuntimeError(f"Google Search grounding is not available on this Gemini key ({str(last_error)[:120]})")

    def audit_shelves(self, frame: np.ndarray, expected: list[dict]) -> dict:
        """One request: what is on the fridge shelves, compared with what should be there.

        `expected` is [{"name": str, "count": int}, ...]. Returns the fields of
        AUDIT_SCHEMA. Raises RuntimeError if Gemini is unavailable.
        """
        listing = "\n".join(f"- {item['name']}: {item['count']}" for item in expected) or "- (nothing has been scanned in)"
        return self._ask_with_fallback(
            AUDIT_PROMPT.format(expected=listing), AUDIT_SCHEMA, frame, AUDIT_MODELS, max_width=1600
        )

    def same_product(self, frame: np.ndarray, catalog_image: np.ndarray) -> Optional[bool]:
        """One request: does the catalog photo show the item in the frame? None when it cannot tell."""
        result = self._ask_with_fallback(
            SAME_PRODUCT_PROMPT, SAME_PRODUCT_SCHEMA, frame, ITEM_MODELS, max_width=1024, extra_image=catalog_image
        )
        log.info("catalog photo check: %s", result)
        return {"same": True, "different": False}.get(result.get("verdict"))

    def read_expiry_frame(self, frame: np.ndarray, item: str = "") -> str:
        return self.read_expiry(item, frame=frame)

    def read_expiry(self, item: str = "", frame: Optional[np.ndarray] = None) -> str:
        """Watch until an expiration date is legible; return it as printed."""
        prompt = EXPIRY_PROMPT
        if item:
            prompt += f"\nThe item is: {item}."

        def accept(result: dict) -> Optional[str]:
            if not result.get("date_visible") or not result.get("date_text"):
                return None
            return str(result["date_text"]).strip()

        # Date stamps are tiny: send the frame at full resolution.
        return self._scan(prompt, EXPIRY_SCHEMA, accept, EXPIRY_MODELS, max_width=1920, frame=frame)

    # -- internals -----------------------------------------------------------
    def _scan(
        self,
        prompt: str,
        schema: dict,
        accept: Callable[[dict], Optional[str]],
        models: list[str],
        max_width: int,
        frame: Optional[np.ndarray] = None,
    ) -> str:
        """Wait for something to be presented, ask Gemini about that frame. "" if nothing was seen.

        Raises RuntimeError when Gemini itself is unusable (bad key, no
        credits, every model rate limited) so the agent can fall back to
        asking the donor straight away instead of sitting in silence.
        """
        if frame is not None:  # caller already chose the frame: one request, no waiting
            return accept(self._ask_with_fallback(prompt, schema, frame, models, max_width)) or ""
        deadline = time.monotonic() + SCAN_TIMEOUT_S
        baseline = None
        for request in range(1, MAX_REQUESTS_PER_SCAN + 1):
            frame, baseline = self._wait_for_presentation(baseline, deadline)
            if frame is None:
                break
            started = time.monotonic()
            result = self._ask_with_fallback(prompt, schema, frame, models, max_width)
            log.info("vision request %d (%.1fs): %s", request, time.monotonic() - started, result)
            answer = accept(result)
            if answer:
                return answer
            if time.monotonic() >= deadline:
                break
        return ""

    def _wait_for_presentation(self, baseline, deadline: float):
        """Block until the donor has brought something into view and is holding it still.

        Returns (frame to send, its small grayscale version). The grayscale
        becomes the baseline for the next round, so after a "nothing visible"
        answer we wait for the picture to change again before spending
        another request.
        """
        started = time.monotonic()
        previous = None
        changed_at = None
        still_since = None
        while True:
            now = time.monotonic()
            frame = self._get_frame()
            if frame is None:  # camera still opening
                if now >= deadline:
                    return None, baseline
                time.sleep(0.2)
                continue
            small = cv2.GaussianBlur(cv2.cvtColor(cv2.resize(frame, (160, 90)), cv2.COLOR_BGR2GRAY), (5, 5), 0)
            if baseline is None:
                baseline = small
            if changed_at is None and _changed_fraction(small, baseline, 25) > CHANGED_PIXEL_FRACTION:
                changed_at = now
            if changed_at is None:
                if now - started >= NO_CHANGE_WAIT_S:
                    return frame, small
            else:
                moving = previous is not None and _changed_fraction(small, previous, 15) > MOVING_PIXEL_FRACTION
                still_since = None if moving else (still_since or now)
                if still_since is not None and now - still_since >= STILL_FOR_S:
                    return frame, small
                if now - changed_at >= SETTLE_MAX_S:
                    return frame, small
            if now >= deadline:
                return frame, small
            previous = small
            time.sleep(0.1)

    def _ask_with_fallback(
        self,
        prompt: str,
        schema: dict,
        frame: np.ndarray,
        models: list[str],
        max_width: int,
        extra_image: Optional[np.ndarray] = None,
    ) -> dict:
        last_error: Optional[Exception] = None
        for model in models:
            if time.monotonic() < self._cooling_until.get(model, 0.0):
                continue
            try:
                return self._ask(model, prompt, schema, frame, max_width, extra_image)
            except errors.ClientError as exc:
                last_error = exc
                if exc.code != 429:
                    break  # bad key / no credits / bad request: another model will not help
                # A per-minute limit clears in seconds, a per-day one in hours.
                # The error says which; honour it so an exhausted model is not
                # retried (and waited on) at every single scan.
                wait = re.search(r"retryDelay': '(\d+)", str(exc))
                cooldown = float(wait.group(1)) + 1 if wait else RATE_LIMIT_COOLDOWN_S
                log.warning("%s is rate limited for %.0f s, trying the next model.", model, cooldown)
                self._cooling_until[model] = time.monotonic() + cooldown
            except Exception as exc:  # timeout, 5xx: the next model may be healthier
                last_error = exc
                log.warning("%s failed (%s), trying the next model.", model, exc)
        detail = getattr(last_error, "message", None) or last_error or "every model is rate limited"
        raise RuntimeError(f"Gemini vision unavailable: {detail}")

    def _ask(
        self,
        model: str,
        prompt: str,
        schema: dict,
        frame: np.ndarray,
        max_width: int,
        extra_image: Optional[np.ndarray] = None,
    ) -> dict:
        images = []
        for image in (frame, extra_image):
            if image is None:
                continue
            if image.shape[1] > max_width:
                scale = max_width / image.shape[1]
                image = cv2.resize(image, (max_width, int(image.shape[0] * scale)), interpolation=cv2.INTER_AREA)
            ok, jpeg = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 88])
            if not ok:
                raise RuntimeError("could not encode frame")
            images.append(types.Part.from_bytes(data=jpeg.tobytes(), mime_type="image/jpeg"))
        response = self._client.models.generate_content(
            model=model,
            contents=[*images, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json", response_schema=schema, temperature=0
            ),
        )
        parsed = response.parsed
        return parsed if isinstance(parsed, dict) else {}
