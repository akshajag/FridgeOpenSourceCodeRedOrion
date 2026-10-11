"""Smart Food Bank Fridge - on-device vision (no API, no rate limits).

Two small open-source models run locally on every frame while Nourish is scanning:

  * RapidOCR  (PaddleOCR models on ONNX Runtime, Apache-2.0) reads the label
    and the expiration date. ~0.3 s per frame on a laptop CPU.
  * YOLOX-tiny (Megvii, Apache-2.0, ONNX) spots and counts bottles, cups and
    loose produce. ~0.05 s per frame.

  * zxing-cpp (Apache-2.0) decodes a UPC/EAN barcode whenever one is in view
    (~0.02 s per frame); the number is looked up in the free Open Food Facts
    catalog, which gives the exact product name, brand and size.

The label text goes back to Nourish as-is ("RED BULL | ENERGY DRINK"); the
agent's own language model turns it into a food name, so no extra model call
is needed. Gemini is only used as a backup, when the local models have seen
nothing useful for a few seconds (e.g. an unlabelled loaf of bread).

    vision = LocalVision(camera.get_frame, fallback=GeminiVision(camera.get_frame))
    agent.set_item_scanner(vision.identify_item)
    agent.set_expiry_scanner(vision.read_expiry)
    agent.set_barcode_scanner(vision.scan_barcode)   # last resort when the item cannot be identified

Standalone check on a single picture (installs what it needs on first run):

    python fridge_local_vision.py path/to/photo.jpg
"""

from __future__ import annotations

import base64
import importlib.util
import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable, Optional


def ensure_dependencies() -> None:
    """Install any missing third-party package, so this file runs on its own.

    Runs before the imports below. Tries pip first, then `uv pip` (a venv
    created by uv has no pip inside it).
    """
    # import name -> package to install
    required = {
        "numpy": "numpy",
        # Headless build: this file never opens an OpenCV window. Skipped if
        # any OpenCV is already installed; two OpenCV builds side by side
        # overwrite each other's files.
        "cv2": "opencv-python-headless",
        "onnxruntime": "onnxruntime",
        "rapidocr": "rapidocr",
        "zxingcpp": "zxing-cpp",
        "ddgs": "ddgs",
        "truststore": "truststore",
    }
    missing = [package for module, package in required.items() if importlib.util.find_spec(module) is None]
    if not missing:
        return
    print(f"Installing missing packages: {', '.join(missing)} ...", flush=True)
    installers = (
        [sys.executable, "-m", "pip", "install", *missing],
        ["uv", "pip", "install", "--python", sys.executable, *missing],
    )
    for command in installers:
        try:
            subprocess.check_call(command)
            importlib.invalidate_caches()
            return
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
    raise SystemExit(f"Could not install {missing}. Install them manually:  pip install {' '.join(missing)}")


ensure_dependencies()

import cv2  # noqa: E402  (must come after ensure_dependencies)
import numpy as np  # noqa: E402

log = logging.getLogger("fridge.local_vision")

MODEL_DIR = Path(__file__).with_name("models")
YOLOX_PATH = MODEL_DIR / "yolox_tiny.onnx"
YOLOX_URL = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_tiny.onnx"
YOLOX_SIZE = 416

# The agent's tool call times out at 20 s.
SCAN_TIMEOUT_S = 12.0
BARCODE_SCAN_WITH_BACKUP_S = 6.0
# After this long with nothing from the local models, spend one Gemini request.
ITEM_FALLBACK_AFTER_S = 5.0
# The date gets one short attempt. Date stamps are small, often on shiny or
# curved surfaces; if it is not legible quickly, the agent just asks the donor
# to read it out, which is faster than coaching them to re-angle the package.
EXPIRY_SCAN_TIMEOUT_S = 6.0
# Have Gemini re-read every date the OCR returns? Off: the free tier allows a
# few dozen Gemini requests a day, and they are better spent identifying the
# product. A date is already only accepted when two frames agree.
VERIFY_EXPIRY_WITH_GEMINI = False
# Text that was already in view when the scan started (posters, T-shirts,
# laptop stickers) is ignored, so the label has to be something the donor
# brought in. The exception, after this long: the detector sees an item but no
# new text ever appeared, i.e. the donor was holding it up before we started.
BASELINE_IGNORE_S = 3.0
# A container with no readable label yet: wait this long for the text to come into focus.
WAIT_FOR_LABEL_S = 1.5

# Certificates are checked by Windows / macOS itself (via `truststore`) rather
# than by Python's bundled OpenSSL. Some retailer image servers send an
# incomplete certificate chain, which the OS completes and OpenSSL rejects
# ("unable to get local issuer certificate"). This is full verification, not
# a bypass; without the package we fall back to Python's default.
try:
    import ssl

    import truststore

    _TLS: Optional["ssl.SSLContext"] = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
except Exception:  # package missing, or an OS it does not support
    _TLS = None

# Retail barcodes only: a QR code on a poster is not a product.
RETAIL_BARCODE_FORMATS = {"EAN-13", "EAN-8", "UPC-A", "UPC-E"}
CATALOG_URL = "https://world.openfoodfacts.org/api/v2/product/{code}.json?fields=product_name,brands,quantity,image_front_url"
CATALOG_SEARCH_URL = (
    "https://search.openfoodfacts.org/search?q={query}&page_size=8"
    "&fields=code,product_name,brands,quantity,categories_tags,image_front_url"
)
CATALOG_TIMEOUT_S = 5.0
# Product photos are only ever downloaded from the catalog's own image host,
# never from a URL that merely appears in a response.
CATALOG_IMAGE_HOSTS = {"images.openfoodfacts.org", "static.openfoodfacts.org"}
CATALOG_IMAGE_MAX_BYTES = 12_000_000  # retailers serve print-resolution shots
# Clean retail product shots (the picture a grocery site shows) come from
# UPCitemdb's free endpoint: no key, 100 requests a day. Open Food Facts'
# own photos are volunteers' phone snapshots, so they are only the fallback.
STORE_LOOKUP_URL = "https://api.upcitemdb.com/prod/trial/lookup?upc={code}"
STORE_SEARCH_URL = "https://api.upcitemdb.com/prod/trial/search?s={query}&match_mode=0&type=product"
# Retailer image hosts a store photo may be downloaded from (matched as a
# suffix). A URL on any other host is ignored, even though the API returned it.
# Listed in order of preference: when several stores carry a photo of the
# product, the grocery chains come first.
STORE_NAMES = {
    "walmartimages.com": "Walmart",
    "samsclub.com": "Sam's Club",
    "samsclubimages.com": "Sam's Club",
    "costco.com": "Costco",
    "costco-static.com": "Costco",
    "media-amazon.com": "Amazon",
    "ssl-images-amazon.com": "Amazon",
    "target.scene7.com": "Target",
    "targetimg1.com": "Target",
    "kroger.com": "Kroger",
    "heb.com": "H-E-B",
    "hebtoyou.com": "H-E-B",
    "walgreens.com": "Walgreens",
    "cvs.com": "CVS",
    "meijer.com": "Meijer",
    "safeway.com": "Safeway",
    "albertsons.com": "Albertsons",
    "publix.com": "Publix",
    "wegmans.com": "Wegmans",
    "aldi.us": "Aldi",
    "traderjoes.com": "Trader Joe's",
    "wholefoodsmarket.com": "Whole Foods",
}
# Hosts a product photo may be downloaded from: the sellers' own image
# servers. Resellers', forums' and blogs' hosts are deliberately absent.
STORE_IMAGE_HOSTS = tuple(STORE_NAMES)
# Live product-listing search: an image search (DuckDuckGo, through the
# open-source `ddgs` library, no key, no account) whose results are kept only
# when they are a product page on one of these sellers' own sites. Listed in
# order of preference.
SELLER_SITES = {
    "walmart.com": "Walmart",
    "samsclub.com": "Sam's Club",
    "costco.com": "Costco",
    "amazon.com": "Amazon",
    "target.com": "Target",
    "kroger.com": "Kroger",
    "heb.com": "H-E-B",
    "walgreens.com": "Walgreens",
    "cvs.com": "CVS",
    "safeway.com": "Safeway",
    "publix.com": "Publix",
    "meijer.com": "Meijer",
    "wegmans.com": "Wegmans",
    "wholefoodsmarket.com": "Whole Foods",
}
LISTING_SEARCH_RESULTS = 50
# The official Kroger API (free developer key from developer.kroger.com).
# Used only when KROGER_CLIENT_ID and KROGER_CLIENT_SECRET are set.
KROGER_TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token"
KROGER_PRODUCTS_URL = "https://api.kroger.com/v1/products?filter.term={query}&filter.limit=5"
MAX_PHOTO_DOWNLOADS = 4
REQUIRE_CLEAN_PHOTO = True  # only ever show studio product shots (plain white backdrop)
REMOVE_PHOTO_BACKGROUND = True  # show catalog photos as cut-outs when they have a plain white backdrop
# Open Food Facts asks every client to identify itself.
CATALOG_USER_AGENT = "NourishSmartFridge/0.1 (community fridge hackathon project)"

MIN_TEXT_SCORE = 0.7
MIN_DETECTION_SCORE = 0.4

COCO_CLASSES = (
    "person,bicycle,car,motorcycle,airplane,bus,train,truck,boat,traffic light,fire hydrant,stop sign,"
    "parking meter,bench,bird,cat,dog,horse,sheep,cow,elephant,bear,zebra,giraffe,backpack,umbrella,handbag,"
    "tie,suitcase,frisbee,skis,snowboard,sports ball,kite,baseball bat,baseball glove,skateboard,surfboard,"
    "tennis racket,bottle,wine glass,cup,fork,knife,spoon,bowl,banana,apple,sandwich,orange,broccoli,carrot,"
    "hot dog,pizza,donut,cake,chair,couch,potted plant,bed,dining table,toilet,tv,laptop,mouse,remote,"
    "keyboard,cell phone,microwave,oven,toaster,sink,refrigerator,book,clock,vase,scissors,teddy bear,"
    "hair drier,toothbrush"
).split(",")
# Things a donor might hold up. Cans and jars have no COCO class and usually
# come back as "bottle" or "cup", so those count as generic containers.
CONTAINER_CLASSES = {"bottle", "cup", "bowl"}
PRODUCE_CLASSES = {"banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake"}

_MONTH = r"(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\.?"
DATE_RE = re.compile(
    r"\b(?:"
    r"20\d{2}[/.\-]\d{1,2}[/.\-]\d{1,2}"  # 2028/03/12
    r"|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}"  # 03/12/2028, 12.03.28
    rf"|\d{{4}}\s*{_MONTH}\s*\d{{1,2}}"  # 2027 JUN 01
    rf"|\d{{1,2}}\s*{_MONTH}\s*\d{{2,4}}"  # 01 JUN 2027
    rf"|{_MONTH}\s*\d{{1,2}},?\s*\d{{4}}"  # JUN 01, 2027
    rf"|{_MONTH}\s*\d{{2,4}}"  # JUN 2027
    r"|\d{1,2}[/.\-]\d{4}"  # 06/2027
    r")\b",
    re.IGNORECASE,
)
DATE_LABEL_RE = re.compile(
    r"(BEST\s*(?:IF\s*USED\s*)?(?:BY|BEFORE)|USE\s*BY|SELL\s*BY|EXP(?:IRY|IRES|IRATION)?\.?(?:\s*DATE)?|BBE?|ENJOY\s*BY)",
    re.IGNORECASE,
)


# Dates that are not expiry dates: lot codes, manufacture / packing dates.
NOT_EXPIRY_RE = re.compile(r"\b(LOT|BATCH|MFG|MFD|MANUFACTURED|PROD(?:UCED)?|PACKED|PKD)\b", re.IGNORECASE)


def _distance(a: tuple, b: tuple) -> float:
    """Distance between the centres of two (x1, y1, x2, y2) boxes."""
    return float(np.hypot((a[0] + a[2]) / 2 - (b[0] + b[2]) / 2, (a[1] + a[3]) / 2 - (b[1] + b[3]) / 2))


def decode_barcode(frame: np.ndarray) -> Optional[tuple[str, tuple]]:
    """Find a retail barcode in a frame -> (digits as a string, (x1, y1, x2, y2)) or None.

    The digits stay a string end to end: UPC codes start with zeros that an
    integer would drop. The decoder verifies the check digit, so a returned
    code is a real read, not a guess.
    """
    import zxingcpp

    for result in zxingcpp.read_barcodes(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)):
        if str(result.format) not in RETAIL_BARCODE_FORMATS or not result.text.isdigit():
            continue
        corners = [result.position.top_left, result.position.top_right,
                   result.position.bottom_right, result.position.bottom_left]
        xs, ys = [corner.x for corner in corners], [corner.y for corner in corners]
        return result.text, (min(xs), min(ys), max(xs), max(ys))
    return None


def _white_border_fraction(image: np.ndarray) -> float:
    """How much of a picture's outer edge is plain white: ~1.0 for a studio product shot."""
    border = np.concatenate([image[0], image[-1], image[:, 0], image[:, -1]]).astype(np.int16)
    return float(((border.min(axis=1) >= 232) & (border.max(axis=1) - border.min(axis=1) <= 12)).mean())


# Words in a retail title that describe packaging, not which product it is.
_TITLE_FILLER = {
    "oz", "ounce", "ounces", "fl", "fluid", "lb", "lbs", "ml", "liter", "litre", "gram", "grams", "kg",
    "can", "cans", "bottle", "bottles", "jar", "box", "bag", "bags", "carton", "pouch", "tub", "cup",
    "pack", "count", "ct", "size", "single", "each", "the", "and", "with", "of", "flavored", "flavor",
    "original", "classic", "food", "snack", "snacks", "drink", "beverage", "plastic", "glass",
    "ip", "dp", "gp", "product", "ref",  # pieces of sellers' page addresses
}


def _store_rank(url: str) -> int:
    """Position of a photo's store in the preference order (unknown hosts last)."""
    host = urllib.parse.urlparse(url).hostname or ""
    for position, suffix in enumerate(STORE_NAMES):
        if host == suffix or host.endswith("." + suffix):
            return position
    return len(STORE_NAMES)


def _is_food_listing(item: dict) -> bool:
    """Only food and drink get a store photo: no shampoo, batteries or cigarettes.

    Listings with no category at all are let through; they are only ever
    looked up for something the food catalog or the vision step already
    identified as food.
    """
    category = (item.get("category") or "").lower()
    if not category:
        return True
    return category.startswith("food, beverages") and "tobacco products" not in category and "> tobacco" not in category


# "Pack of 4", "(24 Pack)", "4pk", "6 count", "24 cans", "4 Can", "value pack", "case"
_MULTIPACK_RE = re.compile(
    r"pack\s*of\s*\d|\b\d+\s*(?:pack|pk|count|ct|cans|bottles|boxes|bags|can|bars|pouches|packets|sticks|cups)\b"
    r"|\bvalue\s*pack\b|\bcase\b|\d+\s*/\s*carton"
)
# How many units the pack holds: "Pack of 6", "8 Count", "24 Pack", "12 ct".
_PACK_SIZE_RE = re.compile(
    r"pack\s*of\s*(\d+)|\b(\d+)\s*(?:pack|pk|count|ct|cans|bottles|boxes|bags|bars|pouches|packets|sticks|cups)\b|(\d+)\s*/\s*carton"
)
# What a single product's page looks like on each seller's site. Category
# and search pages ("Cheerios in Cereal - Walmart.com") are not listings.
_PRODUCT_PAGE_RE = re.compile(r"/ip/|/dp/|/gp/product/|/p/|\.product\.|/product/")


class StoreImages:
    """Product photos from grocery retailers' own listings, for a barcode or a product name.

    The stores' websites sit behind bot protection (a plain request gets a
    CAPTCHA page or a 403), so nothing is scraped from them directly. Two
    legitimate routes carry the same listing photos:
      * UPCitemdb, which aggregates retailer listings (Walmart, Target,
        Walgreens, CVS, Kroger, ...) - free, no key, a few requests a minute.
      * Kroger's official product API, when a free developer key is configured.
    """

    def __init__(self) -> None:
        self._cache: dict[str, list] = {}
        self._lock = threading.Lock()
        self._blocked_until = 0.0  # daily allowance used up: stop asking for a while
        self.last_was_multipack = False  # the newest for_name() result shows a case / multipack
        self._kroger_token = ""
        self._kroger_token_expiry = 0.0
        self._kroger_blocked_until = 0.0
        self._search_blocked_until = 0.0
        self._pack_sizes: dict[str, int] = {}  # photo URL -> units in the pack it shows
        self.last_pack_only = False  # the newest search was for something only sold by the pack
        self._last_ranked: list = []

    def for_barcode(self, code: str) -> list[str]:
        """Image URLs retailers list for this exact barcode."""
        items = self._get("b:" + code, STORE_LOOKUP_URL.format(code=urllib.parse.quote(code)))
        urls = [url for item in items if _is_food_listing(item) for url in item.get("images") or []]
        return sorted(urls, key=_store_rank)

    def for_name(self, query: str, variant: str = "", size: str = "") -> list[str]:
        """Image URLs for the retail listing that best matches a product description.

        Retail titles are long ("Doritos Nacho Cheese Flavored Tortilla Chips
        11 Ounce Bag"), so matching every query word is not enough: "Honey
        Nut Cheerios" also contains "Cheerios". Among listings that cover the
        query, the one with the fewest *other* product words wins, multipacks
        lose, and a matching pack size breaks ties.
        """
        wanted = set(re.findall(r"[a-z0-9]{2,}", query.lower()))
        required = set(re.findall(r"[a-z0-9]{2,}", variant.lower()))
        size_numbers = set(re.findall(r"\d+(?:\.\d+)?", size))
        if not wanted:
            return []
        # The sellers' live listings first. When that finds the product there
        # is no reason to spend the aggregator's small allowance.
        live = self._listing_search_images(query, wanted, required, size_numbers, size)
        if live and (not self.last_was_multipack or self.last_pack_only):
            return live  # a single item's photo, or the pack's photo for a pack-only product
        multipack_only = live  # kept as a last resort, behind anything the other sources find
        best, best_rank = [], None
        # One request only: the free endpoint allows just a few a minute.
        items = self._get("n:" + query.lower(), STORE_SEARCH_URL.format(query=urllib.parse.quote(query)))
        best, best_rank = self._best_listing(items, wanted, required, size_numbers, best, best_rank)
        self.last_was_multipack = (not best_rank[0]) if best else bool(multipack_only)
        return self._kroger_images(query, wanted, required) + sorted(best, key=_store_rank) + multipack_only

    def _listing_search_images(
        self, query: str, wanted: set, required: set, size_numbers: set, size: str = ""
    ) -> list[str]:
        """The product photo from the exact listing at Walmart, Sam's Club, Costco, Amazon, ...

        Free and keyless: an image search through the open-source `ddgs`
        library. Each result carries the page it was found on, that page's
        title and the image itself, so we keep only results that
          * sit on a reputable seller's own site (SELLER_SITES),
          * have their image on that seller's image server, and
          * are titled like the product: its words including the variant.
        The best-matching single-item listing wins; among equals the seller
        order in SELLER_SITES decides. [] when nothing qualifies.
        """
        if time.monotonic() < self._search_blocked_until:
            return []
        key = "s:" + f"{query} {size}".lower()
        with self._lock:
            if key in self._cache:
                best, self.last_was_multipack, self.last_pack_only = self._cache[key]
                return best
        from_search: list = []
        ranked: list = []
        best, rank = [], None
        # Results differ from one search to the next. If the plain description
        # turns up no single-item listing, ask again naming the top seller.
        for search in (f"{query} {size}".strip(), f"{query} {size} walmart".strip()):
            try:
                from ddgs import DDGS

                results = DDGS().images(search, max_results=LISTING_SEARCH_RESULTS)
            except Exception as exc:
                log.warning("Listing search unavailable (%s): not asking again for 2 minutes.", type(exc).__name__)
                self._search_blocked_until = time.monotonic() + 120
                break
            listings = self._seller_listings(results)
            from_search += listings
            best, rank = self._best_listing(listings, wanted, required, size_numbers, best, rank)
            ranked += self._last_ranked
            if best and (rank[0] or self.last_pack_only):
                break  # an exact single-item listing (or the pack, for a pack-only product): done
        listings = from_search
        # Hand back the best few listings' photos, best first, not just one:
        # a listing's picture can turn out to be a tiny thumbnail or fail to
        # download, and the next-best listing of the same kind should then be
        # used. "Same kind": if any individual listing exists, only individual
        # ones are offered; a pack is never a fallback for an individual item.
        if best:
            ranked.sort(key=lambda entry: entry[0], reverse=True)
            ranked = [entry for entry in ranked if entry[0][0] == rank[0]]
            best = list(dict.fromkeys(images[0] for _rank, images in ranked))[:MAX_PHOTO_DOWNLOADS]
        log.info("listing search %r: %d seller listings, picked %s", query, len(listings), best[:1] or "none")
        self.last_was_multipack = bool(best) and not rank[0]
        with self._lock:
            self._cache[key] = (best, self.last_was_multipack, self.last_pack_only)
        return best

    @staticmethod
    def _seller_listings(results: list) -> list:
        """Keep only image-search results that are one product's page on a reputable seller's site."""
        listings = []
        for result in results:
            page_host = (urllib.parse.urlparse(result.get("url") or "").hostname or "").lower()
            seller = next(
                (index for index, site in enumerate(SELLER_SITES) if page_host in (site, "www." + site)), None
            )
            image = result.get("image") or ""
            page_path = urllib.parse.unquote(urllib.parse.urlparse(result.get("url") or "").path)
            if seller is None or _store_rank(image) >= len(STORE_NAMES) or not image.startswith("https://"):
                continue  # not on a seller's site, or the picture is hosted somewhere else
            if not _PRODUCT_PAGE_RE.search(page_path):
                continue  # a category or search page, not one product's listing
            # "Red Bull Zero ... - Walmart.com" / "Amazon.com : Red Bull Zero ..." -> just the product title
            title = re.sub(r"^\s*amazon\.com\s*:\s*|\s*[-|:]\s*(walmart|target|costco|sam's club|kroger)[^-|]*$", "",
                           result.get("title") or "", flags=re.IGNORECASE)
            # The picture's own address often names what it shows
            # (".../Tomato-Soup-10-75-oz-Can-4-Count_..."): a single-item page
            # can still be illustrated with its 4-pack.
            image_path = urllib.parse.unquote(urllib.parse.urlparse(image).path)
            slug = re.sub(r"[-_/]+", " ", f"{page_path} {image_path}").lower()
            page_slug = re.sub(r"[-_/]+", " ", page_path).lower()
            listings.append(
                {"title": title, "brand": "", "images": [image], "seller": seller, "slug": slug, "page_slug": page_slug}
            )
        listings.sort(key=lambda listing: listing["seller"])  # ties in the ranking go to the preferred seller
        return listings

    def _kroger_images(self, query: str, wanted: set, required: set) -> list[str]:
        """Front-of-pack photos from Kroger's official product API. [] unless a key is configured."""
        client_id, secret = os.getenv("KROGER_CLIENT_ID"), os.getenv("KROGER_CLIENT_SECRET")
        if not client_id or not secret or time.monotonic() < self._kroger_blocked_until:
            return []
        key = "k:" + query.lower()
        with self._lock:
            if key in self._cache:
                return self._cache[key]
        try:
            if time.monotonic() >= self._kroger_token_expiry:
                basic = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
                request = urllib.request.Request(
                    KROGER_TOKEN_URL,
                    data=b"grant_type=client_credentials&scope=product.compact",
                    headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"},
                )
                with urllib.request.urlopen(request, timeout=CATALOG_TIMEOUT_S, context=_TLS) as response:
                    token = json.load(response)
                self._kroger_token = token["access_token"]
                self._kroger_token_expiry = time.monotonic() + float(token.get("expires_in", 1800)) - 60
            request = urllib.request.Request(
                KROGER_PRODUCTS_URL.format(query=urllib.parse.quote(query)),
                headers={"Authorization": f"Bearer {self._kroger_token}", "Accept": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=CATALOG_TIMEOUT_S, context=_TLS) as response:
                products = json.load(response).get("data") or []
        except Exception as exc:
            log.warning("Kroger API unavailable (%s): not asking again for 10 minutes.", exc)
            self._kroger_blocked_until = time.monotonic() + 600
            return []
        urls: list[str] = []
        for product in products:
            have = set(re.findall(r"[a-z0-9]{2,}", f"{product.get('description') or ''} {product.get('brand') or ''}".lower()))
            if not required <= have or len(wanted & have) / len(wanted) < 0.6:
                continue
            for image in product.get("images") or []:
                if image.get("perspective") == "front":
                    sizes = {size.get("size"): size.get("url") for size in image.get("sizes") or []}
                    url = sizes.get("large") or sizes.get("xlarge") or sizes.get("medium")
                    if url:
                        urls.append(url)
            if urls:
                break
        with self._lock:
            self._cache[key] = urls
        return urls

    def pack_size_for(self, image_url: str) -> Optional[int]:
        """If this photo is of a multi-unit pack: how many units it holds (0 when unknown). None for a single item."""
        return self._pack_sizes.get(image_url)

    def _best_listing(self, items: list, wanted: set, required: set, size_numbers: set, best: list, best_rank):
        """Pick the listing that is this product -> (its image URLs, its rank). rank[0] is True for a single item."""
        candidates = []
        self._last_ranked = []  # every acceptable listing of this call, with its rank
        for item in items:
            title = (item.get("title") or "").lower()
            have = set(re.findall(r"[a-z0-9]{2,}", f"{title} {item.get('brand') or ''}".lower()))
            coverage = len(wanted & have) / len(wanted)
            if not item.get("images") or not required <= have or coverage < 0.6 or not _is_food_listing(item):
                continue
            # Other product words = a different variant ("Unsalted", "Honey Nut").
            # A listing's page address holds the plain product name, without
            # the marketing copy sellers pad titles with ("Vegan, Non-BPA
            # Lining"), so it is the better place to count them.
            named = set(re.findall(r"[a-z]{2,}", item.get("page_slug") or "")) or have
            extra = {word for word in named - wanted if word.isalpha() and word not in _TITLE_FILLER}
            # Search results cut titles short ("... 8.4 fl oz, 80mg Caffeine ..."),
            # so the page address, which spells the title out in full, is read too.
            full_text = f"{title} {item.get('slug') or ''}"
            multipack = bool(_MULTIPACK_RE.search(full_text))
            if multipack:
                # Remember that these pictures show a whole pack, and how big
                # it is: a single granola bar gets its box's picture, but must
                # still be counted as one bar.
                units = _PACK_SIZE_RE.search(full_text)
                pack_size = int(next((g for g in units.groups() if g), 0)) if units else 0
                for url in item["images"]:
                    self._pack_sizes[url] = pack_size
            same_size = bool(size_numbers & set(re.findall(r"\d+(?:\.\d+)?", full_text)))
            candidates.append((item, multipack, round(coverage, 2), same_size, len(extra)))

        # The individual item always wins. A pack's photo is used only when the
        # product has no individual listing at all (a granola bar is only sold
        # by the box).
        #
        # One trap: a listing that simply does not mention a count is not
        # always the product sold singly. It can be another variant ("Reduced
        # Sugar") or a pack whose title leaves the count out. So a lone such
        # listing among packs only counts as "the individual option" if it
        # names the product as exactly as the best pack listing does, or is
        # in the very size that was scanned ("8.9 oz"). Two or more count-free
        # listings are taken at face value: that product really is sold
        # singly, and their extra words are just marketing copy.
        pack_extras = [extras for _item, multipack, _c, _s, extras in candidates if multipack]
        singles = [(extras, same_size) for _item, multipack, _c, same_size, extras in candidates if not multipack]
        allowed_extras = (min(pack_extras) + 1) if pack_extras else None

        def names_this_product(extras: int, same_size: bool) -> bool:
            return allowed_extras is None or extras <= allowed_extras or same_size

        exact_singles = [single for single in singles if names_this_product(*single)]
        has_individual = bool(exact_singles) or len(singles) >= 2
        self.last_pack_only = bool(pack_extras) and not has_individual

        for item, multipack, coverage, same_size, extras in candidates:
            if self.last_pack_only:
                if not multipack:
                    continue  # another variant's listing, not this product sold singly
                rank = (False, coverage, same_size, -extras, -item.get("seller", 0))
            else:
                if exact_singles and not multipack and not names_this_product(extras, same_size):
                    continue  # prefer the individual listing that actually names this product
                # In order: the individual item, covering the product's words,
                # in the right size, from the preferred seller, with the fewest
                # other product words in its name.
                rank = (not multipack, coverage, same_size, -item.get("seller", 0), -extras)
            self._last_ranked.append((rank, item["images"]))
            if best_rank is None or rank > best_rank:
                best, best_rank = item["images"], rank
        return best, best_rank

    def _get(self, key: str, url: str) -> list:
        with self._lock:
            if key in self._cache:
                return self._cache[key]
        if time.monotonic() < self._blocked_until:
            return []
        request = urllib.request.Request(url, headers={"User-Agent": CATALOG_USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=CATALOG_TIMEOUT_S, context=_TLS) as response:
                items = json.load(response).get("items") or []
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                # The free endpoint allows a handful of requests a minute and
                # 100 a day, and its headers do not say which limit was hit.
                # Back off for a minute and try again then.
                self._blocked_until = time.monotonic() + 60
                log.warning("Store photo service is rate limiting us: no store photos for the next minute.")
            elif exc.code != 404:
                log.warning("Store photo service error: %s", exc)
            return []
        except Exception as exc:
            log.warning("Store photo service unreachable: %s", exc)
            return []
        with self._lock:
            self._cache[key] = items
        return items


def _valid_check_digit(code: str) -> bool:
    """EAN-13 / UPC-A / EAN-8 all end in the same kind of mod-10 check digit."""
    total = sum(int(digit) * (3 if index % 2 else 1) for index, digit in enumerate(reversed(code[:-1]), start=1))
    return (10 - total % 10) % 10 == int(code[-1])


def barcode_digits_from_text(lines: list) -> Optional[tuple[str, tuple]]:
    """Recover a barcode number from the digits printed under the bars -> (code, box) or None.

    A webcam held close to a package is often too blurred or too dim for the
    bars themselves to decode, yet the human-readable number beneath them is
    still legible to the OCR. Any single misread digit breaks the check
    digit, so only a number that passes it is returned; callers additionally
    wait for the same number on two frames.
    """
    digit_lines = [(text, box) for text, _score, box in lines if re.search(r"\d", text)]
    rows: list[list] = []
    for text, box in sorted(digit_lines, key=lambda item: item[1][1]):
        centre, height = (box[1] + box[3]) / 2, box[3] - box[1]
        for row in rows:  # UPC prints its number in pieces ("0 49000 02891 1"): gather a row's pieces
            if abs(row[0][2] - centre) < max(height, row[0][3]) * 0.6:
                row.append((text, box, centre, height))
                break
        else:
            rows.append([(text, box, centre, height)])
    for row in rows:
        row.sort(key=lambda item: item[1][0])
        digits = re.sub(r"\D", "", "".join(item[0] for item in row))
        box = (min(i[1][0] for i in row), min(i[1][1] for i in row), max(i[1][2] for i in row), max(i[1][3] for i in row))
        candidates = [digits] if len(digits) in (8, 12, 13) else []
        if 13 < len(digits) <= 15:  # a stray character glued on: try the windows inside
            candidates += [digits[i : i + 13] for i in range(len(digits) - 12)]
        for candidate in candidates:
            if _valid_check_digit(candidate):
                return candidate, box
    return None


class ProductCatalog:
    """Barcode -> product details from Open Food Facts (free, open data, no key)."""

    def __init__(self) -> None:
        self._cache: dict[str, Optional[dict]] = {}  # hits and misses, so a code is fetched once
        self._lock = threading.Lock()

    def lookup(self, code: str) -> Optional[dict]:
        """{"name", "brand", "size", "image_url"} or None if the catalog has no such product.

        Raises OSError when the catalog cannot be reached, which is a
        different situation from "not in the catalog" and is reported as such.
        """
        with self._lock:
            if code in self._cache:
                return self._cache[code]
        request = urllib.request.Request(CATALOG_URL.format(code=code), headers={"User-Agent": CATALOG_USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=CATALOG_TIMEOUT_S, context=_TLS) as response:
                data = json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                raise
            data = {}
        details = data.get("product") or {}
        product = None
        if data.get("status") == 1 and (details.get("product_name") or "").strip():
            product = {
                "name": details["product_name"].strip(),
                "brand": (details.get("brands") or "").split(",")[0].strip(),
                "size": (details.get("quantity") or "").strip(),
                "image_url": details.get("image_front_url") or "",
            }
        with self._lock:
            self._cache[code] = product
        return product

    def search(self, query: str, size: str = "", variant: str = "") -> Optional[dict]:
        """Best catalog entry for a product described in words ("Red Bull Zero"), or None.

        This is a text search, so the result is the closest listing, not a
        confirmed identity the way a barcode match is. An entry is only
        returned if most of the query words appear in its name or brand;
        `size` ("8.4 fl oz") breaks ties between pack sizes. Every word of
        `variant` ("Zero") must appear, so the regular version of a product
        is never offered as a match for its sugar-free one.
        """
        required = set(re.findall(r"[a-z0-9]{2,}", variant.lower()))
        wanted = set(re.findall(r"[a-z0-9]{2,}", query.lower()))
        if not wanted:
            return None
        url = CATALOG_SEARCH_URL.format(query=urllib.parse.quote(query))
        request = urllib.request.Request(url, headers={"User-Agent": CATALOG_USER_AGENT})
        with urllib.request.urlopen(request, timeout=CATALOG_TIMEOUT_S, context=_TLS) as response:
            hits = json.load(response).get("hits") or []
        size_numbers = set(re.findall(r"\d+(?:\.\d+)?", size))
        best, best_score = None, 0.0
        for hit in hits:
            name = (hit.get("product_name") or "").strip()
            brands = hit.get("brands") or []
            brand = (brands[0] if isinstance(brands, list) and brands else brands if isinstance(brands, str) else "").strip()
            if not name:
                continue
            have = set(re.findall(r"[a-z0-9]{2,}", f"{name} {brand}".lower()))
            # A listing whose name is mostly words we never read (another
            # brand's "Hazelnut Spread" for a label that only said HAZELNUT
            # SPREAD) is a different product, not a close match.
            if not required <= have or len(have - wanted) / len(have) > 0.25:
                continue
            # Reward shared words; mark down listings padded with words we
            # never saw, which are usually a different flavour or a multipack.
            score = len(wanted & have) / len(wanted) - 0.3 * len(have - wanted) / len(have)
            quantity = (hit.get("quantity") or "").strip()
            if size_numbers & set(re.findall(r"\d+(?:\.\d+)?", quantity)):
                score += 0.25  # same pack size
            if hit.get("image_front_url"):
                score += 0.05  # all else equal, a listing with a photo is more useful
            if score > best_score:
                categories = [tag.split(":", 1)[-1].replace("-", " ") for tag in hit.get("categories_tags") or []]
                best_score = score
                best = {
                    "barcode": str(hit.get("code") or ""),
                    "name": name,
                    "brand": brand,
                    "size": quantity,
                    "image_url": hit.get("image_front_url") or "",
                    "category": categories[-1] if categories else "",
                }
        return best if best_score >= 0.6 else None


def remove_plain_background(image: np.ndarray) -> Optional[np.ndarray]:
    """Make a catalog photo's plain white backdrop transparent. BGR in, BGRA out.

    Returns None, meaning "leave the photo alone", when there is no plain
    backdrop to remove: the product fills the frame, or it is a snapshot
    taken on someone's kitchen counter.

    Catalog photos are packshots, so the backdrop is whatever white is
    connected to the picture's border. It is peeled away by flood-filling
    inwards from the border, with the product's outline acting as a wall.
    That keeps white parts of the product itself (a jar's white lid, a pale
    label) which a general-purpose cut-out model tends to erase: two such
    models were tried here and deleted a silver can and a white lid outright.
    """
    height, width = image.shape[:2]
    border = np.concatenate([image[0], image[-1], image[:, 0], image[:, -1]]).astype(np.int16)
    is_white = (border.min(axis=1) >= 232) & (border.max(axis=1) - border.min(axis=1) <= 12)
    if is_white.mean() < 0.6:
        return None

    gray = cv2.GaussianBlur(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (3, 3), 0)
    outline = cv2.dilate(cv2.Canny(gray, 8, 30), np.ones((3, 3), np.uint8))
    mask = np.zeros((height + 2, width + 2), np.uint8)  # floodFill wants a 1 px frame around the mask
    mask[1:-1, 1:-1] = (outline > 0).astype(np.uint8)  # non-zero = wall
    flags = 4 | cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (2 << 8)  # mark filled pixels as 2
    seeds = [(x, y) for x in range(0, width, 4) for y in (0, height - 1)]
    seeds += [(x, y) for y in range(0, height, 4) for x in (0, width - 1)]
    for x, y in seeds:
        if mask[y + 1, x + 1] == 0 and image[y, x].min() >= 232:
            cv2.floodFill(image, mask, (x, y), 0, (10, 10, 10), (25, 25, 25), flags)
    background = cv2.dilate((mask[1:-1, 1:-1] == 2).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    kept = 1.0 - float(background.mean())
    if kept < 0.12 or kept > 0.97:
        return None  # removed nearly everything, or nearly nothing: not worth the risk
    alpha = cv2.GaussianBlur((~background).astype(np.uint8) * 255, (3, 3), 0)  # soften the cut edge
    return np.dstack([image, alpha])


def _normalize(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())


class LocalVision:
    def __init__(
        self,
        get_frame: Callable[[], Optional[np.ndarray]],
        fallback=None,
        on_second_opinion: Optional[Callable[[str, str, str], None]] = None,
        on_product: Optional[Callable[[dict], None]] = None,
        prefer_gemini: bool = False,
    ):
        """`get_frame` returns the newest webcam frame (BGR) or None. `fallback` is an optional GeminiVision.

        `on_second_opinion(kind, local_answer, gemini_answer)` turns on
        cross-checking: every result the on-device models produce from the
        live video is also sent to Gemini, on a background thread, and its
        answer is reported here. `kind` is "item" or "expiry". The local
        answer is returned to the agent immediately either way, so the check
        never adds waiting time.

        `on_product(details)` receives everything learned about each scanned
        item once the background lookup finishes: Gemini's reading of the pack
        (brand, variant, size, container, category, storage, count, sealed)
        plus the closest product-catalog entry and how it was matched.
        """
        self._get_frame = get_frame
        self._fallback = fallback
        self._on_second_opinion = on_second_opinion
        self._on_product = on_product
        # Item detection order. True: Gemini looks first (it names products
        # best) and the on-device models are the backup when Gemini is rate
        # limited or offline. False: the other way round.
        self.prefer_gemini = prefer_gemini
        self.last_details: Optional[dict] = None  # newest result of the background product lookup
        # Catalog photo of the item just scanned, for the UI: (monotonic time, image, caption) or None.
        # The image is BGRA (transparent backdrop) when a plain background was removed, otherwise BGR.
        self.product_photo: Optional[tuple] = None
        self.catalog = ProductCatalog()
        self.store_images = StoreImages()
        # The last catalog match, for a UI or database: {"barcode", "name", "brand", "size", "image_url"}.
        self.last_product: Optional[dict] = None
        self._ocr = None
        self._yolo = None
        self._load_lock = threading.Lock()
        self._infer_lock = threading.Lock()  # one frame through the models at a time
        # What the models saw on the latest scanned frame, for the UI to draw:
        # (monotonic time, [(x1, y1, x2, y2, label), ...]) in frame pixels.
        self.overlay: tuple[float, list] = (0.0, [])

    # -- setup ---------------------------------------------------------------
    def warm_up(self) -> None:
        """Load both models and run them once, so the first real scan is instant."""
        with self._load_lock:
            if self._ocr is not None:
                return
            started = time.monotonic()
            import onnxruntime
            from rapidocr import RapidOCR

            logging.getLogger("RapidOCR").setLevel(logging.WARNING)
            if not YOLOX_PATH.exists():
                MODEL_DIR.mkdir(exist_ok=True)
                log.info("Downloading YOLOX-tiny (19 MB, one time)...")
                urllib.request.urlretrieve(YOLOX_URL, YOLOX_PATH)
            # Two ONNX sessions that each grab every core fight each other and
            # frame times swing from 0.3 s to 3 s. Keeping the detector on two
            # non-spinning threads leaves the cores to the OCR and makes
            # timing steady (~0.4 s OCR + ~0.09 s detection per frame).
            options = onnxruntime.SessionOptions()
            options.intra_op_num_threads = 2
            options.add_session_config_entry("session.intra_op.allow_spinning", "0")
            yolo = onnxruntime.InferenceSession(str(YOLOX_PATH), options, providers=["CPUExecutionProvider"])
            ocr = RapidOCR()
            dummy = np.zeros((360, 640, 3), np.uint8)
            ocr(dummy)
            self._yolo = yolo
            self._detect(dummy)
            self._ocr = ocr
            log.info("Local vision ready (%.1fs).", time.monotonic() - started)

    def warm_up_async(self) -> None:
        threading.Thread(target=self._warm_up_quietly, name="vision-warmup", daemon=True).start()

    def _warm_up_quietly(self) -> None:
        try:
            self.warm_up()
        except Exception as exc:
            log.error("Local vision failed to load: %s", exc)

    # -- scanner hooks -------------------------------------------------------
    def identify_item(self, hint: str = "") -> str:
        """Watch the webcam until a food item is held up; describe it for the agent."""
        self.warm_up()
        self.product_photo = None  # the previous item's picture must not linger over this one
        if self.prefer_gemini and self._fallback is not None:
            answer = self._identify_with_gemini(hint)
            if answer is not None:
                return answer
            log.warning("Gemini is unavailable for this scan: using the on-device models instead.")
        started = time.monotonic()
        baseline: Optional[set[str]] = None
        previous_texts: set[str] = set()
        previous_objects: Optional[tuple[str, int]] = None
        container_since: Optional[float] = None
        tried_fallback = False
        barcode_note = ""
        checked_codes: set[str] = set()
        previous_printed: Optional[str] = None

        while time.monotonic() - started < SCAN_TIMEOUT_S:
            frame = self._get_frame()
            if frame is None:
                time.sleep(0.1)
                continue
            elapsed = time.monotonic() - started
            objects = self._detect(frame)

            # A barcode in view beats everything else: it names the exact
            # product, so there is nothing left to guess from the label.
            found = decode_barcode(frame)
            if found and found[0] not in checked_codes:
                checked_codes.add(found[0])
                self._publish_overlay([], objects, barcode=found)
                match, barcode_note = self._lookup_barcode(found[0])
                if match:
                    answer = f"{match} {self._count_phrase(self._summarize_objects(objects))}"
                    return self._enrich_item(frame, hint, answer, [], catalog_product=self.last_product)

            lines = self._read_text(frame)

            # Bars too blurred to decode? The number printed under them may
            # still be readable. Needs the same number on two frames.
            if not found:
                printed = barcode_digits_from_text(lines)
                if printed and printed[0] == previous_printed and printed[0] not in checked_codes:
                    checked_codes.add(printed[0])
                    found = printed
                    match, barcode_note = self._lookup_barcode(printed[0])
                    if match:
                        answer = f"{match} {self._count_phrase(self._summarize_objects(objects))}"
                        return self._enrich_item(frame, hint, answer, [], catalog_product=self.last_product)
                previous_printed = printed[0] if printed else None

            if baseline is None:
                baseline = {_normalize(text) for text, _score, _box in lines}
            summary = self._summarize_objects(objects)
            label = [line for line in lines if _normalize(line[0]) not in baseline]
            if not label and summary and elapsed >= BASELINE_IGNORE_S:
                # Nothing new has appeared but the detector sees an item: the
                # donor was already holding it up when the scan began, so the
                # "background" text is in fact its label.
                label = lines
            texts = {_normalize(text) for text, _score, _box in label}
            self._publish_overlay(label, objects, barcode=found)  # box only what counts, not the background

            # Accept only what two frames in a row agree on: a single frame
            # can be motion-blurred or catch the item half way into view.
            if texts & previous_texts:
                return self._enrich_item(frame, hint, self._describe(label, summary) + barcode_note, label)
            if summary and summary == previous_objects:
                if summary[0] in PRODUCE_CLASSES:
                    return self._enrich_item(frame, hint, self._describe([], summary), [])
                container_since = container_since or time.monotonic()
                if time.monotonic() - container_since >= WAIT_FOR_LABEL_S:
                    # a container whose label we cannot read
                    return self._enrich_item(frame, hint, self._describe(label, summary) + barcode_note, label)
            else:
                container_since = None
            previous_texts, previous_objects = texts, summary

            if self._fallback is not None and not tried_fallback and elapsed >= ITEM_FALLBACK_AFTER_S:
                tried_fallback = True
                answer = self._ask_fallback(lambda: self.find_in_catalog(frame, hint))
                if answer:
                    return answer
        return ""

    def _identify_with_gemini(self, hint: str) -> Optional[str]:
        """Gemini-first item scan. "" = nothing was held up; None = Gemini could not be used at all."""
        deadline = time.monotonic() + SCAN_TIMEOUT_S
        baseline = None
        for _attempt in range(2):
            # A cheap local check waits until something has been brought into
            # view and is being held still; only that frame goes to Gemini.
            frame, baseline = self._fallback._wait_for_presentation(baseline, deadline)
            if frame is None:
                return ""
            # A barcode in the frame still names the product exactly, and costs nothing to read.
            found = decode_barcode(frame)
            self._publish_overlay([], [], barcode=found)
            if found:
                match, _note = self._lookup_barcode(found[0])
                if match:
                    answer = f"{match} {self._count_phrase(None)}"
                    return self._enrich_item(frame, hint, answer, [], catalog_product=self.last_product)
            try:
                answer = self.find_in_catalog(frame, hint)
            except Exception as exc:
                log.warning("Gemini item scan failed: %s", exc)
                return None
            if answer:
                return answer
            if time.monotonic() >= deadline:
                break
        return ""

    def read_expiry(self, item: str = "") -> str:
        """One short attempt to read an expiration date off the webcam; "" if it is not legible."""
        self.warm_up()
        started = time.monotonic()
        previous: Optional[str] = None
        poll = 0

        while time.monotonic() - started < EXPIRY_SCAN_TIMEOUT_S:
            frame = self._get_frame()
            if frame is None:
                time.sleep(0.1)
                continue
            poll += 1
            # Date stamps are tiny. Every other frame, zoom into the middle
            # of the picture so small print gets twice the pixels.
            view, offset, scale = frame, (0, 0), 1.0
            if poll % 2 == 0:
                height, width = frame.shape[:2]
                x0, y0 = width // 4, height // 4
                view = cv2.resize(frame[y0 : y0 + height // 2, x0 : x0 + width // 2], None, fx=2, fy=2)
                offset, scale = (x0, y0), 0.5
            lines = self._read_text(view, max_width=1280)
            lines = [(text, score, _shift(box, offset, scale)) for text, score, box in lines]
            self._publish_overlay(lines, [])

            found = self._find_date(lines)
            if found:
                date_text, score = found
                # Digits flicker between frames (3 <-> 8, 1 <-> 7): want a
                # very confident read, or the same answer twice.
                if score >= 0.93 or _normalize(date_text) == previous:
                    if VERIFY_EXPIRY_WITH_GEMINI:
                        return self._verified("expiry", frame, item, date_text)
                    return date_text
                previous = _normalize(date_text)
            else:
                previous = None

        return ""

    def scan_barcode(self) -> str:
        """Watch the webcam for a product barcode and look it up. The last resort.

        Works with no OCR, no detector and no Gemini: it only needs the
        barcode decoder and the catalog. Runs for a bounded time, stops at the
        first valid code, and says plainly when nothing was found.
        """
        started = time.monotonic()
        self.product_photo = None
        previous_printed: Optional[str] = None
        # The agent's tool call gives up at 20 s. When Gemini is there to take
        # over, stop looking for bars early enough to leave it room.
        budget = min(SCAN_TIMEOUT_S, BARCODE_SCAN_WITH_BACKUP_S) if self._fallback is not None else SCAN_TIMEOUT_S
        while time.monotonic() - started < budget:
            frame = self._get_frame()
            if frame is None:
                time.sleep(0.1)
                continue
            found = decode_barcode(frame)
            if not found and self._load_ocr_quietly():
                # Second way in: OCR the number printed under the bars.
                printed = barcode_digits_from_text(self._read_text(frame, max_width=1280))
                if printed and printed[0] == previous_printed:
                    found = printed
                previous_printed = printed[0] if printed else None
            self._publish_overlay([], [], barcode=found)
            if found:
                match, note = self._lookup_barcode(found[0])
                if match:
                    # Same follow-up as an item scan: details and the catalog
                    # photo for THIS barcode, fetched in the background.
                    self._enrich_item(frame, "", match, [], catalog_product=self.last_product)
                    return match
                # Read, but not a catalogued product: let Gemini look at the pack instead.
                return f"{note.strip()} {self._gemini_catalog_note(frame)}".strip()
            time.sleep(0.05)
        last_frame = self._get_frame()
        via_gemini = self._gemini_catalog_note(last_frame) if last_frame is not None else ""
        if via_gemini:
            return f"No barcode could be read. {via_gemini}"
        return (
            "No barcode could be read. Ask the donor to hold the barcode flat and still, about a forearm's "
            "length from the camera, in good light, then try once more; otherwise ask them what the product is."
        )

    def _gemini_catalog_note(self, frame: np.ndarray) -> str:
        """Barcode route failed: try the Gemini scan -> catalog route on the same frame. "" if that fails too."""
        if self._fallback is None:
            return ""
        answer = self._ask_fallback(lambda: self.find_in_catalog(frame))
        return f"Looking at the package instead: {answer}." if answer else ""

    def _load_ocr_quietly(self) -> bool:
        """Barcode scanning must keep working even if the OCR model cannot load."""
        if self._ocr is None:
            try:
                self.warm_up()
            except Exception as exc:
                log.warning("OCR unavailable, reading bars only: %s", exc)
        return self._ocr is not None

    def _lookup_barcode(self, code: str) -> tuple[str, str]:
        """(catalog match sentence, note to append when there is no match). One of the two is empty."""
        # EAN codes starting with 2 (UPC codes starting with 02) are assigned
        # by each shop for its own use, typically weighed or in-store items.
        # Different shops reuse the same numbers, so a catalog hit for one of
        # them could be someone else's product entirely.
        padded = code.zfill(13) if len(code) in (12, 13) else ""
        if padded.startswith(("2", "02")):
            return "", f" A barcode was read ({code}) but it is a shop's own in-store code, which cannot be looked up."
        try:
            product = self.catalog.lookup(code)
        except Exception as exc:
            log.warning("Product catalog unreachable: %s", exc)
            return "", f" A barcode was read ({code}) but the product catalog could not be reached to look it up."
        if product is None:
            log.info("barcode %s: not in catalog", code)
            return "", f" A barcode was read ({code}) but it is not in the product catalog."
        self.last_product = {"barcode": code, **product}
        log.info("barcode %s: %s", code, product)
        details = ", ".join(part for part in (product["name"], product["brand"], product["size"]) if part)
        return f"Barcode {code} matched in the product catalog (exact product, not a visual guess): {details}.", ""

    @staticmethod
    def _count_phrase(summary: Optional[tuple[str, int]]) -> str:
        if summary:
            return f"Number of items held up: {summary[1]}."
        return "Could not count them: assume 1 and ask."

    def analyze_image(self, frame: np.ndarray) -> dict:
        """Run both models once on a still picture (no waiting, no background filtering).

        The live scanners above need a moving camera feed; this is the same
        models and the same interpretation on one frame, for testing.
        """
        self.warm_up()
        started = time.monotonic()
        lines = self._read_text(frame, max_width=1280)
        ocr_seconds = time.monotonic() - started
        objects = self._detect(frame)
        date = self._find_date(lines)
        barcode = decode_barcode(frame)
        barcode_result = ""
        if barcode:
            match, note = self._lookup_barcode(barcode[0])
            barcode_result = match or note.strip()
        return {
            "barcode": barcode_result,
            "text_lines": [(text, round(score, 2)) for text, score, _box in lines],
            "objects": [(name, round(score, 2)) for name, score, _box in objects],
            "item_description": self._describe(lines, self._summarize_objects(objects)) if lines or objects else "",
            "expiry_date": date[0] if date else "",
            "ocr_seconds": round(ocr_seconds, 2),
            "detect_seconds": round(time.monotonic() - started - ocr_seconds, 2),
            "boxes": [(*box, name) for name, _score, box in objects]
            + [(*box, text) for text, _score, box in lines]
            + ([(*barcode[1], f"barcode {barcode[0]}")] if barcode else []),
        }

    # -- models --------------------------------------------------------------
    def _read_text(self, frame: np.ndarray, max_width: int = 960) -> list[tuple[str, float, tuple]]:
        """OCR a frame -> [(text, score, (x1, y1, x2, y2))], biggest print first."""
        scale = 1.0
        if frame.shape[1] > max_width:
            scale = max_width / frame.shape[1]
            frame = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        with self._infer_lock:
            result = self._ocr(frame)
        if result is None or not result.txts:
            return []
        lines = []
        for text, score, box in zip(result.txts, result.scores, result.boxes):
            text = text.strip()
            if float(score) < MIN_TEXT_SCORE or len(_normalize(text)) < 3:
                continue
            points = np.asarray(box, dtype=np.float32) / scale
            x1, y1 = points.min(axis=0)
            x2, y2 = points.max(axis=0)
            lines.append((text, float(score), (int(x1), int(y1), int(x2), int(y2))))
        lines.sort(key=lambda line: line[2][3] - line[2][1], reverse=True)
        return lines

    def _detect(self, frame: np.ndarray) -> list[tuple[str, float, tuple]]:
        """YOLOX-tiny -> [(class name, score, (x1, y1, x2, y2))] for food-ish objects only."""
        ratio = min(YOLOX_SIZE / frame.shape[0], YOLOX_SIZE / frame.shape[1])
        resized = cv2.resize(frame, (int(frame.shape[1] * ratio), int(frame.shape[0] * ratio)))
        padded = np.full((YOLOX_SIZE, YOLOX_SIZE, 3), 114, dtype=np.uint8)
        padded[: resized.shape[0], : resized.shape[1]] = resized
        blob = padded.transpose(2, 0, 1)[None].astype(np.float32)
        with self._infer_lock:
            output = self._yolo.run(None, {self._yolo.get_inputs()[0].name: blob})[0][0]

        # The exported model leaves box decoding to us: predictions are
        # per grid cell at strides 8/16/32, as (dx, dy, log w, log h).
        grids, strides = [], []
        for stride in (8, 16, 32):
            size = YOLOX_SIZE // stride
            xs, ys = np.meshgrid(np.arange(size), np.arange(size))
            grids.append(np.stack((xs, ys), axis=2).reshape(-1, 2))
            strides.append(np.full((size * size, 1), stride))
        grids, strides = np.concatenate(grids), np.concatenate(strides)
        centers = (output[:, :2] + grids) * strides
        sizes = np.exp(output[:, 2:4]) * strides
        scores = output[:, 4:5] * output[:, 5:]
        class_ids = scores.argmax(axis=1)
        best = scores[np.arange(len(scores)), class_ids]

        keep = best >= MIN_DETECTION_SCORE
        if not keep.any():
            return []
        boxes = np.concatenate((centers - sizes / 2, sizes), axis=1)[keep] / ratio  # x, y, w, h
        best, class_ids = best[keep], class_ids[keep]
        chosen = cv2.dnn.NMSBoxes(boxes.tolist(), best.tolist(), MIN_DETECTION_SCORE, 0.45)
        detections = []
        for index in np.asarray(chosen).reshape(-1):
            name = COCO_CLASSES[int(class_ids[index])]
            if name in CONTAINER_CLASSES or name in PRODUCE_CLASSES:
                x, y, w, h = boxes[index]
                detections.append((name, float(best[index]), (int(x), int(y), int(x + w), int(y + h))))
        return detections

    # -- interpretation --------------------------------------------------------
    @staticmethod
    def _summarize_objects(objects: list) -> Optional[tuple[str, int]]:
        """(dominant class, how many of it), preferring real produce over generic containers."""
        if not objects:
            return None
        counts: dict[str, int] = {}
        for name, _score, _box in objects:
            counts[name] = counts.get(name, 0) + 1
        produce = {name: n for name, n in counts.items() if name in PRODUCE_CLASSES}
        name = max(produce or counts, key=(produce or counts).get)
        return name, counts[name]

    @staticmethod
    def _describe(label: list, summary: Optional[tuple[str, int]]) -> str:
        parts = []
        if label:
            # Largest print first: that is nearly always the brand / product name.
            unique = list(dict.fromkeys(text for text, _score, _box in label))  # two cans = every line twice
            text = " | ".join(unique[:8])
            parts.append(f"Text printed on the item, largest first: {text}.")
        if summary and summary[0] in PRODUCE_CLASSES:
            parts.append(f"Looks like: {summary[1]} x {summary[0]}.")
        elif summary:
            parts.append(f"Number of containers held up: {summary[1]}.")
        else:
            parts.append("Could not count them: assume 1 and ask.")
        if not label and summary and summary[0] in CONTAINER_CLASSES:
            parts.append("The label was not readable: ask the donor what it is.")
        return " ".join(parts)

    @staticmethod
    def _find_date(lines: list) -> Optional[tuple[str, float]]:
        """Pick the expiration date out of OCR lines -> (text as printed, score)."""
        labelled, bare, label_lines = [], [], []
        for text, score, box in lines:
            text = text.strip()
            match = DATE_RE.search(text)
            has_label = bool(DATE_LABEL_RE.search(text))
            if match and has_label:
                labelled.append((score, text))
            elif match and not NOT_EXPIRY_RE.search(text):
                bare.append((score, match.group(0).strip(), box))
            elif has_label:
                label_lines.append((text, box))

        # "BEST BY 03/12/2028" on one line is unambiguous.
        if labelled:
            score, text = max(labelled)
            return text, score
        if not bare:
            return None
        # "BEST BY" printed on its own line: the date it refers to is the one
        # printed closest to it, not just any date on the package.
        if label_lines:
            label_text, label_box = label_lines[0]
            score, date_text, _box = min(bare, key=lambda candidate: _distance(candidate[2], label_box))
            return f"{label_text} {date_text}", score
        score, date_text, _box = max(bare, key=lambda candidate: candidate[0])
        return date_text, score

    # -- plumbing --------------------------------------------------------------
    def _verified(self, kind: str, frame: np.ndarray, context: str, local_answer: str) -> str:
        """Return the local answer now; have Gemini re-read the same frame in the background."""
        if self._fallback is None or self._on_second_opinion is None:
            return local_answer

        def check() -> None:
            answer = self._ask_fallback(lambda: self._fallback.read_expiry_frame(frame, context))
            if answer:  # rate limited / offline / saw nothing: the local answer simply stands
                self._report(kind, local_answer, answer)

        threading.Thread(target=check, name=f"gemini-check-{kind}", daemon=True).start()
        return local_answer

    def _enrich_item(
        self, frame: np.ndarray, hint: str, local_answer: str, label: list, catalog_product: Optional[dict] = None
    ) -> str:
        """Return the local answer now; work out exactly which product it is in the background.

        Two lookups, neither of which the donor waits for:
          1. Gemini reads the frame for specifics (brand, variant, size, ...).
          2. Open Food Facts is searched for the matching catalog entry,
             unless a barcode already pinned the product down.
        The combined details go to `on_product`, and a one-line summary goes
        to the agent so it can be specific and can question a mismatch.
        """
        if self._on_second_opinion is None and self._on_product is None:
            return local_answer
        label_text = " | ".join(dict.fromkeys(text for text, _score, _box in label))

        def lookup() -> None:
            details: dict = {}
            if self._fallback is not None:
                try:
                    details = self._fallback.product_metadata(frame, label_text, hint)
                except Exception as exc:
                    log.warning("Gemini product details unavailable: %s", exc)
            sentence = self._resolve_product(frame, label, label_text, details, catalog_product)
            self._report("item", local_answer, sentence)

        threading.Thread(target=lookup, name="product-lookup", daemon=True).start()
        return local_answer

    def find_in_catalog(self, frame: Optional[np.ndarray] = None, hint: str = "") -> str:
        """Gemini scan -> catalog: have Gemini read the product, then find its catalog listing.

        The third way into the catalog, for when there is no readable barcode
        and the label text alone did not find a listing. One Gemini request.
        Returns a sentence for the agent, or "" if Gemini saw no food item.
        Raises if Gemini is unavailable.
        """
        if self._fallback is None:
            raise RuntimeError("Gemini is not configured")
        frame = frame if frame is not None else self._get_frame()
        if frame is None:
            return ""
        self.product_photo = None
        details = self._fallback.product_metadata(frame, "", hint)
        if not details:
            return ""
        return self._resolve_product(frame, [], "", details, None, spoken_first=True)

    def _resolve_product(
        self,
        frame: np.ndarray,
        label: list,
        label_text: str,
        details: dict,
        catalog_product: Optional[dict],
        spoken_first: bool = False,
    ) -> str:
        """Find the catalog listing and photo for a product, publish everything, return the summary sentence."""
        product, method = catalog_product, "barcode"
        if product is None:
            method = "catalog text search"
            product = self._search_catalog(details, label, label_text)
        web = self._web_lookup(frame, label_text, details, product if method == "barcode" else None)
        if not details and not product and not web:
            return ""  # nothing learned: the local answer simply stands
        # When the donor is waiting on this answer (spoken_first), skip the
        # Gemini photo comparison: it costs ~5 s and the label-text check is instant.
        photo = (
            self._check_catalog_photo(product, method, frame, details, label_text, allow_gemini=not spoken_first)
            if product
            else None
        )
        if photo and photo["verdict"] == "different":
            # The catalog photo shows something else, so the text search
            # found the wrong listing: drop it rather than show a wrong product.
            log.info("catalog listing rejected, its photo does not match: %s", product)
            product = None
        self.last_details = {
            **details,
            "label_text": label_text,
            "catalog": product,
            "catalog_match_method": method if product else None,
            "catalog_photo": {key: photo[key] for key in ("url", "verdict", "checked_by")} if photo and product else None,
            "web": web or None,
            # Set when the product is sold by the pack and the photo shows that
            # pack: the units in it (0 = unknown). `count` stays the number of
            # individual items the donor is holding, never the number of packs.
            "photo_shows_pack_of": photo.get("pack_size") if photo and product else None,
        }
        if photo and product:
            self.product_photo = (time.monotonic(), photo["image"], photo["caption"])
        log.info("product details: %s", self.last_details)
        if self._on_product is not None:
            try:
                self._on_product(self.last_details)
            except Exception as exc:
                log.warning("Product handler failed: %s", exc)
        # Only tell the agent about a catalog listing we have some reason to
        # trust: Gemini named the brand it was searched on, or its photo
        # checked out. A bare label-text search can land on the regular
        # version of a product; that stays in the record, flagged, unspoken.
        trusted = method == "barcode" or bool(details.get("brand")) or bool(photo and photo["verdict"] == "same")
        sentence = self._details_sentence(details, product if trusted else None, method, spoken_first)
        if photo and product and photo.get("pack_size") is not None:
            units = max(1, int(details.get("count") or 1))
            size = f" of {photo['pack_size']}" if photo["pack_size"] else ""
            sentence = "; ".join(part for part in (sentence, (
                f"this product is sold in packs{size}, so the picture on screen shows the whole pack, "
                f"but the donor has {units} individual item(s): count and log individual items, never packs"
            )) if part)
        if web.get("summary"):
            sentence = "; ".join(part for part in (sentence, f"web search says: {web['summary']}") if part)
        return sentence

    def _search_catalog(self, details: dict, label: list, label_text: str) -> Optional[dict]:
        """Try progressively looser descriptions of the product until the catalog has a listing."""
        brand, variant, name = (details.get(key) or "" for key in ("brand", "variant", "product_name"))
        size = details.get("size") or label_text
        queries = []
        if brand:
            # Catalogs name things "brand variant" ("Red Bull Zero"); the generic
            # product words ("energy drink") are a second attempt, not the first.
            queries += [f"{brand} {variant}".strip(), f"{brand} {variant} {name}".strip(), f"{brand} {name}".strip()]
        elif name:
            queries += [f"{variant} {name}".strip(), name]
        if not queries:
            # No Gemini reading: search on the label's own words, minus weights and codes.
            queries = [" ".join(text for text, _score, _box in label[:4] if not re.search(r"\d", text))]
        for query in dict.fromkeys(query for query in queries if query):
            try:
                product = self.catalog.search(query, size, variant)
            except Exception as exc:
                log.warning("Product catalog search unavailable: %s", exc)
                return None
            if product:
                log.info("catalog search %r -> %s", query, product["name"])
                return product
        return None

    def _web_lookup(self, frame: np.ndarray, label_text: str, details: dict, barcode_product: Optional[dict]) -> dict:
        """Ask Gemini to look the product up on the web (Google Search). {} when unavailable."""
        if self._fallback is None or not getattr(self._fallback, "web_search_available", False):
            return {}
        known = dict(details)
        if barcode_product:
            known.update(barcode=barcode_product.get("barcode"), catalog_name=barcode_product.get("name"),
                         catalog_brand=barcode_product.get("brand"), catalog_size=barcode_product.get("size"))
        try:
            return self._fallback.web_lookup(frame, label_text, known)
        except Exception as exc:
            log.warning("Web lookup unavailable: %s", exc)
            return {}

    def _check_catalog_photo(
        self, product: dict, method: str, frame: np.ndarray, details: dict, label_text: str, allow_gemini: bool = True
    ) -> Optional[dict]:
        """Download the catalog's product photo and decide whether it really shows this item.

        Returns None when there is no photo to show. Otherwise a dict with
        the image, a `verdict` of "same" / "different" / "unverified", and
        `checked_by`, which says how that was decided:
          * barcode    - the listing came from the item's own barcode;
          * label text - the brand and variant words read off the held item
                         are also printed on the pack in the photo (local OCR);
          * gemini     - Gemini compared the photo with the camera frame.
        """
        picked = self._pick_photo(product, method, details)
        if picked is None:
            return None
        url, image, from_store, exact = picked

        verdict, checked_by = "unverified", None
        if method == "barcode" and exact:
            verdict, checked_by = "same", "barcode"  # the photo is filed under the item's own barcode
        else:
            # Words that identify the product: brand and variant if Gemini
            # gave them, otherwise the biggest lines of the label itself.
            identity = " ".join(str(details[key]) for key in ("brand", "variant") if details.get(key))
            identity = identity or " ".join(label_text.split(" | ")[:2])
            if not identity.strip() and method == "barcode":
                # Barcode-identified product, photo found by name: the pack in
                # the photo should at least carry the catalog's brand or name.
                identity = product.get("brand") or product.get("name") or ""
            wanted = set(re.findall(r"[a-z]{3,}", identity.lower()))
            try:
                on_photo = " ".join(text for text, _score, _box in self._read_text(image)).lower()
            except Exception as exc:
                log.warning("Could not read the catalog photo: %s", exc)
                on_photo = ""
            if wanted and all(word in on_photo for word in wanted):
                verdict, checked_by = "same", "label text"
            elif self._fallback is not None and allow_gemini:
                try:
                    same = self._fallback.same_product(frame, image)
                    if same is not None:
                        verdict, checked_by = ("same" if same else "different"), "gemini"
                except Exception as exc:
                    log.warning("Gemini could not check the catalog photo: %s", exc)
        if checked_by is None and from_store and not exact:
            # Found by name on a seller's site: the listing's title had to
            # contain the product's words, variant included, to be picked at
            # all. That is the check, even when the OCR could not also read
            # the words off a small product shot.
            verdict, checked_by = "same", "listing title"
        position = _store_rank(url)
        store = list(STORE_NAMES.values())[position] if position < len(STORE_NAMES) else "Store"
        pack_size = self.store_images.pack_size_for(url)
        kind = f"{store} photo" if from_store else "Catalog photo"
        if pack_size is not None:
            # Some things are only sold by the box: the picture is the box.
            kind += f" of the pack ({pack_size} ct)" if pack_size else " of the pack"
        caption = kind + {
            "barcode": " - matched by barcode",
            "label text": " - label matches",
            "gemini": " - checked against camera",
            "listing title": " - listing matches",
            None: " - NOT verified",
        }[checked_by]
        log.info("catalog photo %s: %s (%s)", url, verdict, checked_by)
        # Cut the backdrop out only now: the checks above need the untouched photo.
        try:
            cutout = remove_plain_background(image) if REMOVE_PHOTO_BACKGROUND else None
            if cutout is not None:
                image = cutout
        except Exception as exc:
            log.warning("Could not remove the photo background: %s", exc)
        return {
            "url": url, "image": image, "verdict": verdict, "checked_by": checked_by, "caption": caption,
            "pack_size": pack_size,
        }

    def _pick_photo(self, product: dict, method: str, details: dict) -> Optional[tuple]:
        """Choose the picture to show -> (url, image, is a store photo, filed under this exact barcode).

        Preference order: a retailer's shot for this barcode, a retailer's
        shot found by product name, then the catalog's own (volunteer) photo.
        Within that order the first clean studio shot wins, i.e. one with a
        plain white backdrop; a snapshot is only used if nothing better exists.
        """
        barcode = product.get("barcode") or ""
        exact = method == "barcode"

        def store_by_barcode() -> list:
            return [(url, True, exact) for url in self.store_images.for_barcode(barcode)] if barcode else []

        def store_by_name() -> list:
            brand, variant = details.get("brand") or product.get("brand") or "", details.get("variant") or ""
            name = details.get("product_name") or product.get("name") or ""
            if brand and brand.lower() in name.lower():
                brand = ""  # catalog names often already contain the brand
            query = " ".join(part for part in (brand, variant, name) if part)
            size = details.get("size") or product.get("size") or ""
            return [(url, True, False) for url in self.store_images.for_name(query, variant, size)]

        def catalog_own() -> list:
            return [(product["image_url"], False, exact)] if product.get("image_url") else []

        # Most trustworthy source first. A scanned barcode is the best key, so
        # the stores' photo for that barcode leads when there is one. Otherwise
        # the seller's listing found from the product's details (brand,
        # variant, size) leads. That search returns a single item's photo when
        # one exists, and the pack's photo when the product is only sold by
        # the pack (one granola bar -> the box it came in), and remembers which.
        if exact:
            sources = (store_by_barcode, store_by_name, catalog_own)
        else:
            sources = (store_by_name, store_by_barcode, catalog_own)
        fallback = None
        for source in sources:
            for url, from_store, is_exact in source()[:MAX_PHOTO_DOWNLOADS]:
                image = self._download_photo(url)
                if image is None:
                    continue
                if min(image.shape[:2]) >= 200 and _white_border_fraction(image) >= 0.6:
                    return url, image, from_store, is_exact
                fallback = fallback or (url, image, from_store, is_exact)
        # Nothing clean was found. A volunteer's snapshot of someone holding
        # the product is not what a shopper expects to see, so show no picture
        # rather than that one (set REQUIRE_CLEAN_PHOTO = False to allow it).
        return None if REQUIRE_CLEAN_PHOTO else fallback

    @staticmethod
    def _download_photo(url: str) -> Optional[np.ndarray]:
        parsed = urllib.parse.urlparse(url)
        host = parsed.hostname or ""
        allowed = host in CATALOG_IMAGE_HOSTS or any(host == s or host.endswith("." + s) for s in STORE_IMAGE_HOSTS)
        if parsed.scheme != "https" or not allowed:
            return None
        if host == "target.scene7.com":
            # Search results link Target's 100-pixel thumbnail; the same address serves any size.
            url = re.sub(r"([?&])(wid|hei)=\d+", r"\g<1>\g<2>=800", url)
        try:
            request = urllib.request.Request(url, headers={"User-Agent": CATALOG_USER_AGENT, "Accept": "image/*"})
            with urllib.request.urlopen(request, timeout=CATALOG_TIMEOUT_S, context=_TLS) as response:
                data = response.read(CATALOG_IMAGE_MAX_BYTES + 1)
        except Exception as exc:
            log.info("photo not downloadable (%s): %s", host, exc)
            return None
        if len(data) > CATALOG_IMAGE_MAX_BYTES:
            return None
        image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)
        if image is None:
            return None
        if image.dtype != np.uint8:
            image = cv2.convertScaleAbs(image, alpha=255.0 / float(np.iinfo(image.dtype).max))
        if image.ndim == 2:
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        elif image.shape[2] == 4:
            # A transparent PNG: lay it on white. Dropping the alpha channel
            # instead leaves whatever junk colour sits in the see-through pixels.
            alpha = image[..., 3:4].astype(np.float32) / 255.0
            image = (image[..., :3] * alpha + 255.0 * (1.0 - alpha)).astype(np.uint8)
        if image is not None and max(image.shape[:2]) > 800:  # a thumbnail is all the UI needs
            scale = 800 / max(image.shape[:2])
            image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        return image

    @staticmethod
    def _details_sentence(details: dict, product: Optional[dict], method: str, spoken_first: bool = False) -> str:
        parts = []
        name = " ".join(str(details[key]) for key in ("brand", "variant", "product_name") if details.get(key))
        if name:
            extras = [str(details[key]) for key in ("size", "container") if details.get(key)]
            # `spoken_first`: this is the first the agent hears of the item, not a re-check of an earlier answer.
            lead = "The camera reads it as" if spoken_first else "Second camera reads it as"
            parts.append(f"{lead}: {', '.join([name, *extras])}")
        if details.get("count"):
            parts.append(f"count {details['count']}")
        if details.get("sealed") is False:
            parts.append("the packaging looks opened or damaged")
        for key in ("category", "storage"):
            if details.get(key):
                parts.append(f"{key}: {details[key]}")
        if product and method != "barcode":
            listing = ", ".join(part for part in (product["name"], product["brand"], product["size"]) if part)
            parts.append(f"closest catalog listing (text search, not confirmed by barcode): {listing}")
        return "; ".join(parts)

    def _report(self, kind: str, local_answer: str, answer: str) -> None:
        if self._on_second_opinion is None or not answer:
            return
        try:
            self._on_second_opinion(kind, local_answer, answer)
        except Exception as exc:
            log.warning("Second-opinion handler failed: %s", exc)

    def _ask_fallback(self, call: Callable[[], str]) -> str:
        try:
            answer = call()
            log.info("Gemini backup answered: %r", answer)
            return answer
        except Exception as exc:
            log.warning("Gemini backup unavailable: %s", exc)
            return ""

    def _publish_overlay(self, lines: list, objects: list, barcode: Optional[tuple] = None) -> None:
        boxes = [(*box, name) for name, _score, box in objects]
        boxes += [(*box, text) for text, _score, box in lines[:8]]
        if barcode:
            boxes.append((*barcode[1], f"barcode {barcode[0]}"))
        self.overlay = (time.monotonic(), boxes)


def _shift(box: tuple, offset: tuple, scale: float) -> tuple:
    """Map a box from a zoomed crop back to full-frame pixels."""
    x1, y1, x2, y2 = box
    return (
        int(x1 * scale) + offset[0],
        int(y1 * scale) + offset[1],
        int(x2 * scale) + offset[0],
        int(y2 * scale) + offset[1],
    )


if __name__ == "__main__":
    # Quick self-test on one picture:  python fridge_local_vision.py photo.jpg
    if len(sys.argv) < 2:
        raise SystemExit(f"usage: python {Path(__file__).name} <image path> [more images...]")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    scanner = LocalVision(get_frame=lambda: None)
    scanner.warm_up()
    for image_path in sys.argv[1:]:
        image = cv2.imread(image_path)
        if image is None:
            print(f"\n{image_path}: could not be read as an image")
            continue
        report = scanner.analyze_image(image)
        print(f"\n{image_path}  ({image.shape[1]}x{image.shape[0]})")
        print(f"  text read   ({report['ocr_seconds']} s): {report['text_lines'] or 'none'}")
        print(f"  objects     ({report['detect_seconds']} s): {report['objects'] or 'none'}")
        print(f"  for Nourish : {report['item_description'] or 'nothing recognised'}")
        print(f"  barcode     : {report['barcode'] or 'none in view'}")
        print(f"  expiry date : {report['expiry_date'] or 'none found'}")
        # Save a copy with everything the models found boxed in green.
        for x1, y1, x2, y2, label in report["boxes"]:
            cv2.rectangle(image, (x1, y1), (x2, y2), (128, 222, 74), 2)
            cv2.putText(image, str(label)[:28], (x1, max(18, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (128, 222, 74), 2)
        annotated = Path(image_path).with_name(Path(image_path).stem + "_scanned.jpg")
        cv2.imwrite(str(annotated), image)
        print(f"  annotated   : {annotated}")
