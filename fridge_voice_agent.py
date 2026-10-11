"""Smart Food Bank Fridge - ElevenLabs real-time voice agent.

Bidirectional, interruptible voice over the ElevenLabs Conversational AI
WebSocket (official `elevenlabs` SDK), playing through the JBL Go 3 and
listening on the Logitech webcam mic.

Quick start
-----------
    pip install -r requirements.txt
    # .env: ELEVENLABS_API_KEY=...            (ELEVENLABS_AGENT_ID is written by the next step)
    python fridge_voice_agent.py --setup-agent    # create/update the agent (prompt + tools) from this file
    python fridge_voice_agent.py                  # talk to it
    python fridge_voice_agent.py --text           # no audio hardware: type instead of talking

Gemini handoff (next step)
--------------------------
The vision code only needs a `FridgeVoiceAgent` instance:

    agent.update_inventory("3 cans of beans, 1 loaf of bread (expires Oct 12)")   # silent context push
    agent.update_conditions("3.8 C, 41% RH, food-safe")                          # silent context push
    agent.announce("Fridge temperature has risen to 9 C")                        # agent speaks up now
    agent.set_item_scanner(lambda hint: gemini_identify_item(hint))              # agent pulls: food + amount
    agent.set_expiry_scanner(lambda item: gemini_read_expiry(item))              # agent pulls: printed date
    agent.set_barcode_scanner(lambda: scan_and_look_up_barcode())                # agent pulls: last resort
    agent.on_user_utterance(lambda text: ...)                                    # what the donor said

While running, the console accepts the same injections by hand (/inv, /cond,
/ctx, /alert) so the voice side can be demoed before Gemini is wired in.
"""

from __future__ import annotations

import argparse
import json
import logging
from fridge_storage_policy import storage_verdict
import os
import queue
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

import numpy as np
import sounddevice as sd
from dotenv import load_dotenv, set_key
from fridge_placement import PlacementPending
from elevenlabs.client import ElevenLabs
from elevenlabs.conversational_ai.conversation import (
    AudioInterface,
    ClientTools,
    Conversation,
)

log = logging.getLogger("fridge.voice")

ENV_PATH = Path(__file__).with_name(".env")
TRANSCRIPT_DIR = Path(__file__).with_name("transcripts")

# --------------------------------------------------------------------------
# Audio format. The agent is configured for raw PCM16 mono @ 16 kHz in both
# directions (see build_agent_config), so no codec sits between us and the
# socket: bytes off the mic go straight up, bytes off the socket go straight
# to the speaker.
# --------------------------------------------------------------------------
SAMPLE_RATE = 16_000
BYTES_PER_FRAME = 2  # int16 mono

# Mic chunk size. The SDK suggests 250 ms; we send 100 ms chunks so the
# server-side VAD notices a barge-in ~150 ms sooner, at the cost of a few more
# (tiny) WebSocket frames per second.
MIC_CHUNK_FRAMES = 1_600
# Upper bound on mic audio waiting for the network (~2 s). If the uplink
# stalls we drop the OLDEST audio: stale speech arriving seconds late is worse
# than a gap, and it keeps latency from accumulating for the rest of the demo.
MIC_QUEUE_MAX_CHUNKS = 20

# Echo guard. A speaker and an open mic on the same table means the agent
# hears itself and "interrupts" its own sentence. While the agent is audible:
#   gate - mic audio quieter than --gate-rms is replaced with silence, so only
#          a donor speaking up (closer/louder than the echo) barges in.
#   mute - mic is fully silenced (half duplex; no barge-in, safest in a loud hall).
#   off  - true full duplex (headset, or hardware echo cancellation).
ECHO_TAIL_S = 0.35  # Bluetooth keeps playing ~200-300 ms after we stop feeding it
GATE_HANGOVER_S = 0.6  # once the gate opens, keep it open across quiet syllables
DEFAULT_GATE_RMS = 2500.0  # int16 RMS; tune on site with --mic-test

BARCODE_RESULT_MIN_DELAY_S = 0.0  # time for the agent to finish asking for the barcode

MAX_RECONNECTS = 5

# --------------------------------------------------------------------------
# Persona
# --------------------------------------------------------------------------
AGENT_NAME = "Smart Food Bank Fridge - Nourish"
DEFAULT_VOICE_ID = "mUMf6FnFQ187d2RrRzft"  # Project custom voice; requires access in the ElevenLabs account.
# Nourish starts in English and switches to whichever of these a person speaks.
EXTRA_LANGUAGES = ["es", "fr", "zh", "hi", "ar", "vi", "pt", "ko", "ja", "de", "it", "ru", "tl"]
FIRST_MESSAGE = "Hi, I'm Nourish. Are you donating refrigerated food, or collecting as a food-bank employee or mission volunteer?"

SYSTEM_PROMPT = """\
You are Nourish, the voice of a managed food-bank refrigerated unit. You speak out loud through a small speaker to people standing at the fridge. You are warm, upbeat and brief, and you make giving feel like a small win.

# Language
You start in English. If the person speaks another language, or asks for one, call language_detection to switch, then carry on entirely in their language: the questions, the food names and the dates. Everything you receive from tools and background updates is in English; translate it naturally as you speak and never read English tool text aloud to someone speaking another language. Product and brand names stay as they are.

# How you speak
- This is spoken audio. One or two short sentences per turn, then stop and listen. No lists, no markdown, no emoji, no stage directions.
- Ask one question at a time. People have their hands full.
- If someone interrupts you, drop what you were saying and respond to what they said. Never restart a sentence you were cut off from.
- If you could not hear or understand, say so simply and ask again. Never guess.
- The fridge is in a busy, noisy room and your microphone picks up other people's conversations. If what you hear is clearly not addressed to you (people chatting to each other, talk about unrelated topics, half sentences), call skip_turn and say nothing. Do not answer it, comment on it, or repeat your question.
- If the person is silent, or their turn is empty or just "...", call skip_turn and keep waiting quietly. They are probably busy with their hands. Never say "it looks like you didn't say anything" or ask if they are still there.
- Only ever output the words you will speak. Never output your reasoning, plans or notes.

# Who you meet
This is a managed FOOD-BANK REFRIGERATED UNIT, not an unrestricted community fridge. Ask whether the person is donating, a food-bank employee collecting stock, or a volunteer collecting for a mission.

## Employees and mission volunteers collecting food
1. Ask for their username. Then ask for the six-digit pickup code generated while signed into the website's Missions page. A username or claimed role alone does NOT authenticate anyone. Call authenticate_pickup. Never ask for passwords. Do not tell them to take food until the tool confirms authentication and a before-shelf image is captured.
2. If authorization fails, politely ask them to sign in and generate a new code. Do not invent an authenticated identity or grant access based on conversation. Only the tool determines employee versus volunteer role and mission.
3. After successful authorization, ask which listed inventory product and how many units they need. Use the product_id and quantity from the tool's inventory list; do not invent IDs. Tell them to remove only that product/quantity, move their hands away, then explicitly confirm they have taken it.
4. Call record_pickup with pickup_confirmed=true. It compares shelf images and records removal and mission pickup points only on verified success. If pending, retry the inside check; never award points in conversation. A volunteer earns 10 points once for this pickup leg, not for finished delivery. Employees get no mission points. Report only the points returned by the tool. Tell volunteers to take the food to the receiving desk; receiving confirmation is separate.
5. Ask them to generate a new code for another pickup, or end_call when finished. All authorization resets between clients.

## Donors: walk them through it
Follow these steps in order for every item. Do not skip steps.
The camera scans actively: it watches until something is held up, so you never wait for the donor to say they are ready. In step 1 you ask and start the item scan in the same turn. For dates, first offer speaking or camera reading and respect the donor's choice.
1. Say: "Please hold the item up to the camera." and call scan_donation_item right away, in that same turn.
2. The scan result is raw: the words printed on the package (largest print first) and a count. Work out the food yourself from the brand and product words, ignoring weights, slogans and nutrition text. Then ask them to confirm, and be as specific as the scan allows: brand, variant or flavour, size, container and amount, in one question. For example: "Is that an 8.4 ounce can of Red Bull Zero, one can?" or "Is that Bush's black beans, the 15 ounce can, two cans?" Use only details the scan actually gave you. Never fill in a size, flavour or variant from memory, and if one is missing just leave it out. Then wait for their answer. If the words do not tell you what the food is, say what you can read and ask what it is. If the result says a barcode matched the product catalog, that is the exact product: use its name, brand and size as given.
   If the scan says the item may not belong in the fridge, or that it is not clear what it is: do not accept it and do not turn it away yet. Say what the camera sees, then ask the donor for more information about the product so that you can verify whether you can store it in the fridge. Put it in your own words each time and fit it to the item, for example "That looks like a pack of batteries to me. Can you tell me more about it, so I can check whether it can go in the fridge?" Never use the same sentence twice in a row. Then decide from what they tell you, using the acceptance rules in step 6: if it turns out to be sealed, in-date food or drink, carry on with the steps; if not, decline kindly and say why.
   If the donor asks to scan a barcode, immediately use scan_product_barcode, the local barcode decoder, without an item/Gemini scan first. Barcode as a fallback: if the scan found nothing, the camera is not working, or you and the donor still cannot settle exactly which product it is, say "Can you turn the package so its barcode faces the camera?" and call scan_product_barcode right away, in that same turn. If that also finds nothing, or the barcode is not in the catalog, do not guess and do not try the barcode more than twice: ask the donor to tell you what it is and go by what they say. Loose produce like an apple has no barcode and does not need one.
3. Confirm the food and amount, then call check_storage_suitability. This unit accepts chilled food and beverages; it is NOT a pantry. Doritos, chips, crackers, cookies and dry snacks belong at the pantry collection, not inside. Frozen-only food needs a freezer. If the tool says no, explain and redirect. If unsure, ask them to read the storage instructions, read those back for confirmation, then call the tool with those instructions and donor_confirmed=true. Never bypass a no/unsure result by treating all food as acceptable.
4. Ask: "Please tell me the expiration date, or hold the printed date in front of the camera so I can read it." Offer BOTH choices immediately. If they say a date, do not call scan_expiration_date: read the date back, ask them to confirm it, then call record_expiration_date with an unambiguous YYYY-MM-DD date and donor_confirmed=true. Ask for month/day/year if any part is missing or ambiguous; never guess. If they choose the camera, call scan_expiration_date. Never interrupt someone reading a date aloud with another scan request.
5. If the camera returns a date, read it aloud and ask them to confirm it. If unreadable, immediately say "I can't read that clearly. You can tell me the date instead." Do not force another camera attempt. A donor-reported date is not a camera-verified date. If no date can be supplied, ask for operator review rather than inventing one.
6. Accept only after check_storage_suitability says yes, the food is unopened and in date, and there are no concerns about damaged packaging. Ask an operator if uncertain. Dry pantry snacks do not belong here even if sealed and in date. Then ask them to place it inside and explicitly confirm placement. Confirming its name or date does not confirm placement.
7. Once they explicitly confirm placement, say "Let me check the inside camera" and call log_donation with placement_confirmed=true for this ONE product and its quantity. This tool compares before/after inside-camera pictures and only records if it verifies a new matching item. If it cannot verify, do not announce a donation: ask them to make the item visible on the shelf and tell you when ready; then retry log_donation without rescanning the donor camera. Once the tool reports saved, ask if they have another item; if so go back to step 1. Include barcode digits if read. Never bundle different products into one log call.
8. Only after the tool reports the donation was saved, thank the donor. Do not offer or mention points, scores, rewards or a leaderboard.
9. Ask if they have another item. If they say no, they are finished, cancel, or say goodbye, give a brief farewell and call end_call. Never stay in the same conversation for the next donor. Ending discards unfinished scans; it never records an unconfirmed donation. If they have more items, continue this session.

# Live fridge data
You cannot see or feel anything yourself. Everything you know about the fridge arrives one of three ways:
- Background updates beginning with [FRIDGE VISION] or [FRIDGE SENSORS]. These are live facts from the camera and sensors. Absorb them silently; never read them out word for word and never mention that you received an update.
- Tool results from get_fridge_status, scan_donation_item, scan_product_barcode and scan_expiration_date.
- Background updates beginning with [FRIDGE VISION CHECK]. A second, slower camera system re-examined the item or date you just scanned. If it agrees with what the donor confirmed, say nothing about it. If it only adds detail you did not have (a size, a variant, a category), quietly use the fuller description from then on, including when you log the donation. If it says the product is sold in packs, that is only about the picture on the screen: the amount is still the number of individual items the donor is holding, so one granola bar out of a box is one item, not one box. If it disagrees (a different food, a different amount, a different date, or it says the package looks opened or damaged), bring it up at your next turn in one short question, for example "My second camera counted two cans, is that right?", and go with what the donor answers. Never quietly swap in the second camera's answer: the donor must confirm any change. If the donor says they are finished while a disagreement is still open, ask about it first and only then call log_donation.
- Messages beginning with [CAMERA RESULT]. These come from the camera, not from the person: a scan that finished after you had already spoken. Treat one exactly like a tool result and carry on with the donation steps from there.
- Messages beginning with [FRIDGE ALERT]. These come from the fridge, not from the person. Tell the person about it right away in one calm sentence.
If you have no data for something, say you cannot check right now. Never invent inventory, expiry dates or temperatures.

# Safety
When unsure whether food is safe, do not accept it. Sensor alerts indicate changing operating conditions, not proof of spoilage or safety. Never call monitoring coverage a food safety confidence score; ask an operator to check alerts. Do not give medical, allergy or dietary guarantees; point people to the label.

Stay on the fridge, food and the donation. If asked about something else, answer in a few friendly words and steer back.
"""

# Tools the agent can call. They execute in THIS process (ClientTools), which is
# what lets them read live Gemini state. Names must match _build_client_tools.
CLIENT_TOOL_SPECS = [
    {"type": "system", "name": "end_call", "description": "End this donor session after they finish, cancel or say goodbye. Say a brief farewell; the kiosk will reset for the next donor.", "params": {"system_tool_type": "end_call"}},
    {
        # Built-in ElevenLabs tool: switches the conversation (speech
        # recognition and voice) to the language the person is speaking.
        "type": "system",
        "name": "language_detection",
        "description": (
            "Switch the conversation to the language the person is speaking. Call as soon as they speak, "
            "or ask for, a language other than the current one."
        ),
        "params": {"system_tool_type": "language_detection"},
    },
    {
        # Built-in ElevenLabs tool: lets the agent stay silent for a turn
        # instead of replying to background chatter or to silence.
        "type": "system",
        "name": "skip_turn",
        "description": (
            "Stay silent and keep listening. Use when the speech was not addressed to you "
            "(background conversation) or when the person said nothing."
        ),
        "params": {"system_tool_type": "skip_turn"},
    },
    {
        "type": "client",
        "name": "get_fridge_status",
        "description": (
            "Get the latest snapshot of what is inside the fridge (items and expiry dates) and its "
            "temperature and humidity. Call before telling anyone what is in the fridge or whether it is food-safe."
        ),
        "expects_response": True,
        "response_timeout_secs": 10,
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "type": "client",
        "name": "scan_donation_item",
        "description": (
            "Look through the camera at the item the donor is holding up and identify the food and how many "
            "there are. The camera keeps watching until an item appears, so call this in the same turn "
            "as asking the donor to hold the item up; do not wait for them to say they are ready."
        ),
        "expects_response": True,
        "response_timeout_secs": 30,
        "pre_tool_speech": "force",  # the request is spoken first, then the scan runs
        "parameters": {
            "type": "object",
            "properties": {
                "item_hint": {
                    "type": "string",
                    "description": "What the donor said the item is, e.g. 'canned beans'. Empty if they did not say.",
                }
            },
            "required": [],
        },
    },
    {
        "type": "client",
        "name": "scan_product_barcode",
        "description": (
            "Read the UPC/EAN barcode on the package through the camera and look the product up in a catalog. "
            "Returns the exact product name, brand and size, or says that no barcode was read or that it is not "
            "in the catalog. Use when the item could not be identified any other way. The camera keeps watching "
            "until a barcode is visible, so call this in the same turn as asking the donor to show the barcode."
        ),
        "expects_response": True,
        "response_timeout_secs": 30,
        "pre_tool_speech": "force",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "type": "client",
        "name": "scan_expiration_date",
        "description": (
            "Read a printed expiration date ONLY when the donor chooses the camera option. "
            "If the donor reads a date aloud, use record_expiration_date instead. "
            "An unreadable result means offer speaking the date immediately, not repeated scans."
        ),
        "expects_response": True,
        "response_timeout_secs": 40,
        "pre_tool_speech": "force",
        "parameters": {
            "type": "object",
            "properties": {
                "item": {
                    "type": "string",
                    "description": "The confirmed food and amount, e.g. '2 cans of black beans'.",
                }
            },
            "required": [],
        },
    },
    {"type":"client", "name":"check_storage_suitability", "description":"Required before accepting any donation. Dry pantry food such as Doritos does not belong in this refrigerated unit. Unknown storage requires package instructions or operator review.", "expects_response":True,"response_timeout_secs":10,"parameters":{"type":"object","properties":{"item":{"type":"string"},"storage_instructions":{"type":"string"},"donor_confirmed":{"type":"boolean"}},"required":["item"]}},
    {"type":"client", "name":"authenticate_pickup", "description":"Verify an employee/mission volunteer using their signed-in website username and short-lived six-digit pickup code; capture shelf BEFORE removal. Username or claimed role alone is not authentication.","expects_response":True,"response_timeout_secs":20,"parameters":{"type":"object","properties":{"username":{"type":"string"},"code":{"type":"string"}},"required":["username","code"]}},
    {"type":"client", "name":"record_pickup", "description":"After authentication and explicit removal confirmation, verify matching shelf removal, reduce inventory, and award mission pickup points once. Do not claim completed delivery or SOL payment.","expects_response":True,"response_timeout_secs":40,"parameters":{"type":"object","properties":{"product_id":{"type":"string"},"quantity":{"type":"integer"},"pickup_confirmed":{"type":"boolean"}},"required":["product_id","quantity","pickup_confirmed"]}},
    {
        "type": "client", "name": "record_expiration_date",
        "description": "Save the expiration date spoken by the donor after reading it back and receiving confirmation. Never guess an ambiguous or missing month/day/year. This records donor-reported evidence, not camera evidence.",
        "expects_response": True, "response_timeout_secs": 10,
        "parameters": {"type": "object", "properties": {
            "date": {"type": "string", "description": "Unambiguous complete date in YYYY-MM-DD format."},
            "donor_confirmed": {"type": "boolean", "description": "True only after donor confirms your read-back."}
        }, "required": ["date", "donor_confirmed"]},
    },
    {
        "type": "client",
        "name": "log_donation",
        "description": (
            "Record only after the donor explicitly confirms placement and the inside camera verifies it. "
            "Returns whether the donation was saved. Donations do not award mission pickup points."
        ),
        "expects_response": True,
        "response_timeout_secs": 40,
        "parameters": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "string",
                    "description": "Comma-separated accepted items, e.g. '2 cans of beans, 1 loaf of bread'.",
                },
                "item_count": {"type": "integer", "description": "Total number of individual items accepted."},
                "placement_confirmed": {"type": "boolean", "description": "True only when the donor explicitly said these items have already been placed inside. Item identity/date confirmation is not placement confirmation."},
                "barcode": {
                    "type": "string",
                    "description": "The product barcode digits, exactly as given by a scan result, if one was read.",
                },
                "donor_name": {
                    "type": "string",
                    "description": "Donor's first name or nickname, only if they volunteered it.",
                },
            },
            "required": ["items", "item_count", "placement_confirmed"],
        },
    },
]


# ElevenLabs requires a description for each client-tool input.
_TOOL_PARAMETER_HELP = {
    'item': 'Confirmed product name from the scan or donor.',
    'storage_instructions': 'Storage instructions read from the package by the donor; do not invent them.',
    'donor_confirmed': 'True only after the donor explicitly confirms your read-back.',
    'username': 'Exact username displayed on the signed-in Missions pickup-code panel.',
    'code': 'Six-digit pickup authorization code displayed to that signed-in user. Never a password.',
    'product_id': 'Exact product UUID from the authenticated pickup inventory list.',
    'quantity': 'Number of individual units collected, from 1 to 100.',
    'pickup_confirmed': 'True only after the authenticated user explicitly says the requested food has been removed.'
}
for _spec in CLIENT_TOOL_SPECS:
    if _spec.get('type') == 'client':
        for _name, _property in _spec.get('parameters', {}).get('properties', {}).items():
            if _name in _TOOL_PARAMETER_HELP:
                _property.setdefault('description', _TOOL_PARAMETER_HELP[_name])


def build_agent_config() -> dict:
    """Server-side agent definition. Edit the prompt above, re-run --setup-agent."""
    tts = {
        # ElevenLabs requires this model while the agent's main language is
        # English; for the other languages below it switches to the
        # multilingual version by itself when the language changes.
        "model_id": "eleven_flash_v2",
        "voice_id": os.getenv("ELEVENLABS_VOICE_ID", DEFAULT_VOICE_ID),
        "agent_output_audio_format": "pcm_16000",
    }
    return {
        # Every extra language the agent may switch into. The language_detection
        # tool (see CLIENT_TOOL_SPECS) does the switching when a donor speaks one.
        "language_presets": {code: {"overrides": {"agent": {"language": code}}} for code in EXTRA_LANGUAGES},
        "agent": {
            "first_message": FIRST_MESSAGE,
            "language": "en",
            "prompt": {
                "prompt": SYSTEM_PROMPT,
                "llm": os.getenv("ELEVENLABS_AGENT_LLM", "gemini-2.5-flash"),
                "temperature": 0.4,
                # Thinking off: faster first word, and stops the model's
                # private reasoning from leaking into what gets spoken.
                "thinking_budget": 0,
                "tools": CLIENT_TOOL_SPECS,
            },
        },
        "tts": tts,
        "asr": {"user_input_audio_format": "pcm_16000"},
        # Donors are busy loading a fridge: wait as long as allowed before re-prompting.
        "turn": {"turn_timeout": 30, "turn_eagerness": "patient"},
        "conversation": {
            "max_duration_seconds": 1800,
            "client_events": [
                "audio",
                "interruption",
                "user_transcript",
                "agent_response",
                "agent_response_correction",
                "client_tool_call",
                "ping",
            ],
        },
    }


def ensure_voice(client: ElevenLabs, voice_id: str) -> None:
    """Make sure the voice is in this account's "My Voices"; add it from the Voice Library if not.

    An agent can only use a voice the account holds. A voice picked from
    elevenlabs.io/voices is a shared library voice and has to be added once.
    """
    try:
        client.voices.get(voice_id)
        return
    except Exception:
        pass  # not in the account yet
    matches = [voice for voice in client.voices.get_shared(search=voice_id).voices if voice.voice_id == voice_id]
    if not matches:
        raise RuntimeError(f"Voice {voice_id} is not in this account and was not found in the Voice Library.")
    voice = matches[0]
    client.voices.share(public_user_id=voice.public_owner_id, voice_id=voice_id, new_name=voice.name)
    log.info("Added voice '%s' (%s) to this account from the Voice Library.", voice.name, voice_id)


def setup_agent(client: ElevenLabs) -> str:
    """Create the agent, or update it in place if ELEVENLABS_AGENT_ID is set."""
    agent_id = os.getenv("ELEVENLABS_AGENT_ID")
    config = build_agent_config()
    ensure_voice(client, config["tts"]["voice_id"])
    # Lets --text mode switch a session to text-only (no TTS credits while testing).
    platform = {"overrides": {"conversation_config_override": {"conversation": {"text_only": True}}}}
    if agent_id:
        client.conversational_ai.agents.update(
            agent_id, name=AGENT_NAME, conversation_config=config, platform_settings=platform
        )
        log.info("Updated agent %s", agent_id)
    else:
        created = client.conversational_ai.agents.create(
            name=AGENT_NAME, conversation_config=config, platform_settings=platform
        )
        agent_id = created.agent_id
        ENV_PATH.touch(exist_ok=True)
        set_key(str(ENV_PATH), "ELEVENLABS_AGENT_ID", agent_id)
        log.info("Created agent %s (saved to %s)", agent_id, ENV_PATH.name)
    return agent_id


# --------------------------------------------------------------------------
# Audio I/O
# --------------------------------------------------------------------------
def resolve_device(spec: Optional[str], kind: str) -> Optional[int]:
    """Map a device index or name fragment ('JBL', 'Logitech') to a PortAudio index.

    Returns None (system default) when nothing matches, so a missing or
    renamed device degrades to "whatever Windows is using" instead of a crash.
    """
    if not spec:
        return None
    if spec.isdigit():
        return int(spec)
    for index, device in enumerate(sd.query_devices()):
        if spec.lower() in device["name"].lower() and device[f"max_{kind}_channels"] > 0:
            return index
    log.warning("No %s device matching %r - using the system default.", kind, spec)
    return None


def _stream_settings(device: Optional[int]):
    """WASAPI shared mode refuses 16 kHz unless told to resample; MME/DirectSound just do it."""
    if device is None or not hasattr(sd, "WasapiSettings"):
        return None
    host_api = sd.query_hostapis(sd.query_devices(device)["hostapi"])["name"]
    return sd.WasapiSettings(auto_convert=True) if "WASAPI" in host_api else None


def _open_stream(stream_cls, device: Optional[int], kind: str, **kwargs):
    """Open on the requested device, falling back to the system default."""
    try:
        return stream_cls(device=device, extra_settings=_stream_settings(device), **kwargs)
    except Exception as exc:
        if device is None:
            raise
        log.warning("Could not open %s device %s (%s) - using the system default.", kind, device, exc)
        return stream_cls(device=None, **kwargs)


def _rms(chunk: bytes) -> float:
    samples = np.frombuffer(chunk, dtype=np.int16).astype(np.float32)
    return float(np.sqrt(np.mean(samples * samples))) if samples.size else 0.0


class SpeakerMicInterface(AudioInterface):
    """Mic -> WebSocket and WebSocket -> speaker, built for barge-in.

    Buffering strategy
    ------------------
    Uplink (mic):
        PortAudio callback -> bounded queue -> sender thread -> ws.send().
        The callback runs on a real-time thread, so it only copies bytes into
        the queue and never touches the network. The queue is bounded and
        drops oldest-first (see MIC_QUEUE_MAX_CHUNKS).

    Downlink (speaker):
        ElevenLabs streams TTS faster than real time, so each agent turn
        arrives as a burst of chunks. They are appended to one FIFO byte
        buffer, and the PortAudio output callback pulls exactly the number of
        frames the sound card asks for (~10-20 ms at a time).
          * A 200 ms pre-roll absorbs chunk timing jitter; short utterances
            start after 250 ms without further incoming audio.
          * Underrun = silence, not a stopped stream. The stream runs for the
            whole session, which also keeps the Bluetooth link to the JBL
            awake; a link that goes idle clips the first syllable when it wakes.
          * Interrupt = clear the FIFO. Because playback is pulled in ~10-20 ms
            slices rather than pushed in big blocking writes, the agent goes
            quiet within one callback of the server's interruption event.
            (The JBL's own Bluetooth buffer, ~200 ms, is outside our reach.)
    """

    def __init__(
        self,
        input_device: Optional[int] = None,
        output_device: Optional[int] = None,
        echo_guard: str = "gate",
        gate_rms: float = DEFAULT_GATE_RMS,
        on_interrupt: Optional[Callable[[], None]] = None,
    ):
        self._input_device = input_device
        self._output_device = output_device
        self._echo_guard = echo_guard
        self._gate_rms = gate_rms
        self._on_interrupt = on_interrupt

        self._lifecycle_lock = threading.Lock()
        self._running = threading.Event()
        self._playback = bytearray()
        self._playback_lock = threading.Lock()
        self._mic_queue: queue.Queue[bytes] = queue.Queue(maxsize=MIC_QUEUE_MAX_CHUNKS)
        self._playback_ready = False
        self._last_received = 0.0
        self.output_underflows = 0
        self._prebuffer_bytes = int(SAMPLE_RATE * 0.20) * BYTES_PER_FRAME
        self._last_audible = 0.0  # monotonic time real audio last went to the speaker
        self._gate_open_until = 0.0
        self._in_stream = None
        self._out_stream = None
        self._sender: Optional[threading.Thread] = None
        self._input_callback: Optional[Callable[[bytes], None]] = None

    # -- AudioInterface ----------------------------------------------------
    def start(self, input_callback: Callable[[bytes], None]):
        with self._lifecycle_lock:
            if self._running.is_set():
                return
            self._input_callback = input_callback
            self._out_stream = _open_stream(
                sd.RawOutputStream,
                self._output_device,
                "output",
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="int16",
                latency="high",
                blocksize=640,
                callback=self._on_speaker,
            )
            self._in_stream = _open_stream(
                sd.RawInputStream,
                self._input_device,
                "input",
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="int16",
                blocksize=MIC_CHUNK_FRAMES,
                callback=self._on_mic,
            )
            self._running.set()
            self._sender = threading.Thread(target=self._send_loop, name="mic-uplink", daemon=True)
            self._sender.start()
            self._out_stream.start()
            self._in_stream.start()

    def stop(self):
        # The SDK calls this from several places (normal shutdown, a failed
        # send on the uplink thread, a dropped socket), sometimes more than
        # once, so it must be idempotent and must not join its own thread.
        with self._lifecycle_lock:
            if not self._running.is_set():
                return
            self._running.clear()
            for stream in (self._in_stream, self._out_stream):
                try:
                    stream.abort()
                    stream.close()
                except Exception as exc:
                    log.debug("Error closing audio stream: %s", exc)
            self._in_stream = self._out_stream = None
            sender, self._sender = self._sender, None
        if sender and sender is not threading.current_thread():
            sender.join(timeout=1.0)
        with self._playback_lock:
            self._playback.clear()
            self._playback_ready = False

    def output(self, audio: bytes):
        with self._playback_lock:
            self._playback.extend(audio)
            self._last_received = time.monotonic()

    def interrupt(self):
        with self._playback_lock:
            self._playback.clear()
            self._playback_ready = False
        if self._on_interrupt:
            self._on_interrupt()

    # -- real-time callbacks -------------------------------------------------
    def _on_speaker(self, outdata, frames, time_info, status):
        needed = frames * BYTES_PER_FRAME
        if status and getattr(status, "output_underflow", False):
            self.output_underflows += 1
        with self._playback_lock:
            available = len(self._playback)
            if not self._playback_ready:
                self._playback_ready = available >= self._prebuffer_bytes or (available >= 2 and time.monotonic() - self._last_received >= 0.25)
            take = min(needed, available) // BYTES_PER_FRAME * BYTES_PER_FRAME if self._playback_ready else 0
            chunk = bytes(self._playback[:take])
            del self._playback[:take]
            if self._playback_ready and take < needed:
                self._playback_ready = False
        if chunk:
            self._last_audible = time.monotonic()
        outdata[:] = chunk + b"\x00" * (needed - len(chunk))

    def _on_mic(self, indata, frames, time_info, status):
        chunk = bytes(indata)
        try:
            self._mic_queue.put_nowait(chunk)
        except queue.Full:
            try:
                self._mic_queue.get_nowait()
            except queue.Empty:
                pass
            try:
                self._mic_queue.put_nowait(chunk)
            except queue.Full:
                pass

    # -- uplink --------------------------------------------------------------
    def _send_loop(self):
        while self._running.is_set():
            try:
                chunk = self._mic_queue.get(timeout=0.2)
            except queue.Empty:
                continue
            callback = self._input_callback
            if callback and self._running.is_set():
                callback(self._apply_echo_guard(chunk))

    def _apply_echo_guard(self, chunk: bytes) -> bytes:
        if self._echo_guard == "off":
            return chunk
        now = time.monotonic()
        if now - self._last_audible > ECHO_TAIL_S:
            return chunk  # agent is not audible: pass the mic through untouched
        # Suppressed audio is sent as silence, not skipped, so the server's
        # VAD keeps receiving a continuous, correctly-timed stream.
        silence = b"\x00" * len(chunk)
        if self._echo_guard == "mute":
            return silence
        if _rms(chunk) >= self._gate_rms:
            self._gate_open_until = now + GATE_HANGOVER_S
        return chunk if now < self._gate_open_until else silence


def mic_test(device: Optional[int], seconds: float = 8.0):
    """Print mic levels so --gate-rms can be set above the speaker's echo."""
    print("Mic level (int16 RMS). Stay quiet while the speaker plays something, then talk:")
    with _open_stream(
        sd.RawInputStream, device, "input", samplerate=SAMPLE_RATE, channels=1, dtype="int16", blocksize=4000
    ) as stream:
        for _ in range(int(seconds * 4)):
            data, _overflowed = stream.read(4000)
            level = _rms(bytes(data))
            print(f"  {level:8.0f}  {'#' * min(60, int(level / 150))}")


# --------------------------------------------------------------------------
# Transcript
# --------------------------------------------------------------------------
class TranscriptLog:
    """Everything said in a run, in memory and appended to a JSONL file."""

    def __init__(self, directory: Optional[Path] = None):
        directory = directory or TRANSCRIPT_DIR
        directory.mkdir(parents=True, exist_ok=True)
        self.path = directory / f"session_{datetime.now():%Y%m%d_%H%M%S}.jsonl"
        self.entries: list[dict] = []
        self._lock = threading.Lock()

    def add(self, event: str, text: str = "", **extra) -> dict:
        entry = {"ts": datetime.now().isoformat(timespec="milliseconds"), "event": event, "text": text, **extra}
        with self._lock:
            self.entries.append(entry)
            try:
                with self.path.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
            except OSError as exc:
                log.warning("Could not write transcript: %s", exc)
        return entry

    def count(self, event: str) -> int:
        with self._lock:
            return sum(1 for entry in self.entries if entry["event"] == event)


# --------------------------------------------------------------------------
# The agent
# --------------------------------------------------------------------------
class _Conversation(Conversation):
    """Conversation that remembers why its socket thread died.

    The SDK lets a failed connect (bad agent ID, account out of credits)
    escape as an uncaught exception on a background thread, where nothing
    can report it. Keep it so the UI can say what is actually wrong.
    """

    connect_error: Optional[BaseException] = None

    def _run(self, ws_url: str):
        try:
            super()._run(ws_url)
        except Exception as exc:
            self.connect_error = exc



class FridgeVoiceAgent:
    """Owns the conversation session and is the single surface Gemini talks to."""

    def __init__(
        self,
        client: ElevenLabs,
        agent_id: str,
        *,
        text_mode: bool = False,
        input_device: Optional[int] = None,
        output_device: Optional[int] = None,
        echo_guard: str = "gate",
        gate_rms: float = DEFAULT_GATE_RMS,
        reconnect: bool = True,
    ):
        self._client = client
        self._agent_id = agent_id
        self._text_mode = text_mode
        self._audio_kwargs = dict(
            input_device=input_device, output_device=output_device, echo_guard=echo_guard, gate_rms=gate_rms
        )
        self._reconnect = reconnect

        self.transcript = TranscriptLog()
        self.donations: list[dict] = []

        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._conversation: Optional[Conversation] = None
        # channel -> [latest text, already sent this session?]
        self._context: dict[str, list] = {}
        self._item_scanner: Optional[Callable[[str], str]] = None
        self._expiry_scanner: Optional[Callable[[str], str]] = None
        self._barcode_scanner: Optional[Callable[[], str]] = None
        self._barcode_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="barcode")
        self._barcode_job = None
        self._barcode_claimed = False
        self._utterance_listeners: list[Callable[[str], None]] = []
        self._donation_listeners: list[Callable[[dict], None]] = []
        self._donation_store = None
        self._caption_listeners: list[Callable[[str, str], None]] = []
        self._checks = 0
        self._pending_products: list[dict] = []  # scanned since the last logged donation
        self._session_generation = 0
        self._expiration = None
        self._storage_evidence = {}
        self._pickup_auth = None
        self._pickup_authenticator = None
        self._pickup_store = None
        self._session_reset_listeners = []
        self._session_permission = None

    # ======================================================================
    # Gemini / sensor hooks. All are thread-safe and never raise, so the
    # vision loop can call them on every frame without guarding.
    # ======================================================================
    def update_inventory(self, summary: str) -> None:
        """PUSH: latest inventory + expiry dates from Gemini's webcam pass."""
        self._set_context("FRIDGE VISION", summary)

    def update_conditions(self, summary: str) -> None:
        """PUSH: latest temperature / humidity / food-safety reading."""
        self._set_context("FRIDGE SENSORS", summary)

    def push_context(self, text: str, channel: str = "FRIDGE VISION") -> None:
        """PUSH: any other fact the agent should silently know (replaces the channel's last value)."""
        self._set_context(channel, text)

    def report_second_opinion(self, kind: str, first_answer: str, second_answer: str) -> None:
        """PUSH: a slower, independent check (Gemini) of a scan the agent already acted on.

        `kind` is "item" or "expiry". Arrives a few seconds after the scan, as
        a silent update; the prompt tells the agent to speak up only if it
        contradicts what the donor confirmed.
        """
        self._checks += 1
        if kind == "item":
            text = f"Check {self._checks}, more detail on the item just scanned. {second_answer}."
        else:
            digits = lambda value: "".join(ch for ch in value if ch.isdigit())  # noqa: E731
            if digits(first_answer) == digits(second_answer):
                log.info("expiry date confirmed by second read: %s", second_answer)
                return  # both reads agree: nothing the agent needs to do
            text = (
                f"Check {self._checks}, second read of the expiration date: {second_answer} "
                f"(the first read was {first_answer}). The two reads disagree."
            )
        self.transcript.add("second_opinion", second_answer, kind=kind, first=first_answer)
        self._set_context("FRIDGE VISION CHECK", text)

    def record_product(self, details: dict) -> None:
        """PUSH: full details of a scanned product (vision reading + catalog entry).

        Kept with the session and attached to the next logged donation, so the
        dashboard / database gets brand, variant, size, category, catalog
        barcode and image, not just the words the agent spoke.
        """
        if details.get("fridge_ok") in ("no", "unsure") or details.get("is_food") is False:
            # Not something to log: something to ask about. Put it on screen.
            seen = str(details.get("object_seen") or "This item").strip()
            concern = str(details.get("concern") or "not sure it is food").strip()
            verdict = "may not belong in the fridge" if details.get("fridge_ok") == "no" else "needs checking"
            self._caption("notice", f"{seen[:1].upper()}{seen[1:]} - {verdict}: {concern}")
            self._caption("product", "")
            return
        self._caption("notice", "")
        with self._lock:
            self._pending_products.append(details)
        catalog = details.get("catalog") or {}
        name = " ".join(str(details[key]) for key in ("brand", "variant", "product_name") if details.get(key))
        shown = [name or catalog.get("name"), details.get("size") or catalog.get("size"),
                 details.get("container"), details.get("category") or catalog.get("category")]
        if details.get("photo_shows_pack_of") is not None:
            pack = details["photo_shows_pack_of"]
            shown.append(f"single item, photo shows the pack{f' of {pack}' if pack else ''}")
        self._caption("product", "  |  ".join(str(part) for part in shown if part))

    def announce(self, text: str) -> bool:
        """PUSH + SPEAK: make the agent tell the person something now (e.g. a temperature alarm).

        Sent as a turn, so unlike a contextual update it triggers a spoken
        reply. Dropped (returns False) if no session is live: a stale alarm
        should not be replayed at whoever walks up next.
        """
        conversation = self._live_conversation()
        if conversation is None:
            log.warning("announce() dropped, no live session: %s", text)
            return False
        try:
            conversation.send_user_message(f"[FRIDGE ALERT] {text.strip()}")
            self.transcript.add("alert", text.strip())
            return True
        except Exception as exc:
            log.warning("announce() failed: %s", exc)
            return False

    def set_item_scanner(self, scanner: Callable[[str], str]) -> None:
        """PULL: called (off the audio threads) when the agent asks the camera to look at an item.

        `scanner(item_hint) -> str` should grab a frame, ask Gemini, and return
        the food and the amount in one plain-English sentence, e.g. "2 sealed
        cans of black beans".

        The agent calls this the moment it finishes asking, before the donor
        has moved, so the scanner must do the waiting: keep sampling frames
        until an item is in view, then return. Give up (return "") within
        ~15 s; the tool times out at 20 s.
        """
        self._item_scanner = scanner

    def set_barcode_scanner(self, scanner: Callable[[], str]) -> None:
        """PULL: called when the agent asks the donor to show the barcode (the last resort).

        `scanner() -> str` should watch for a UPC/EAN barcode, look it up in a
        product catalog and return one plain-English sentence: the match, or
        an honest "no barcode read" / "not in the catalog".
        """
        self._barcode_scanner = scanner

    def set_expiry_scanner(self, scanner: Callable[[str], str]) -> None:
        """PULL: called when the agent asks the camera to read an expiration date.

        `scanner(item) -> str` gets the confirmed food ("2 cans of black
        beans") and should return the date as printed, e.g. "Best by March 12,
        2028", or "" if it cannot be read. Same contract as the item scanner:
        poll frames until a date is legible, give up within ~15 s.
        """
        self._expiry_scanner = scanner

    def on_user_utterance(self, listener: Callable[[str], None]) -> None:
        """Subscribe to finalized transcripts of what the person said."""
        self._utterance_listeners.append(listener)

    def on_caption(self, listener: Callable[[str, str], None]) -> None:
        """Subscribe to display events as `listener(role, text)`.

        Roles: "agent" (a line Nourish is speaking), "agent_cut_off" (the part
        actually heard before a barge-in), "user", "status", "donation",
        "product" (details of the item just scanned; "" clears it),
        "notice" (an item that may not belong in the fridge; "" clears it).
        Called from background threads: a UI must hand off to its own thread.
        """
        self._caption_listeners.append(listener)

    def on_donation_logged(self, listener: Callable[[dict], None]) -> None:
        """Subscribe to accepted donations (dashboard / TigerData)."""
        self._donation_listeners.append(listener)

    def set_donation_store(self, store) -> None:
        """Persist before acknowledging a donation."""
        self._donation_store=store

    # ======================================================================
    # Lifecycle
    # ======================================================================
    def on_session_reset(self, listener: Callable[[], None]) -> None:
        """Clear per-donor UI, camera state and frontend auth on every session end."""
        self._session_reset_listeners.append(listener)

    def reset_donor_session(self) -> None:
        """Keep fridge context/history; discard everything belonging to the departing donor."""
        with self._lock:
            self._session_generation += 1
            self._pending_products.clear()
            self._expiration = None
            self._storage_evidence = {}
            self._pickup_auth = None
            self._checks = 0
            job = self._barcode_job
            self._barcode_job = None
            self._barcode_claimed = False
            self._context = {key: [value[0], False] for key, value in self._context.items()
                             if key in ("FRIDGE VISION", "FRIDGE SENSORS")}
        if job is not None:
            job.cancel()
        for listener in list(self._session_reset_listeners):
            try:
                listener()
            except Exception:
                log.exception("Kiosk session reset failed")
                self._stop.set()  # Never let a new donor inherit a failed auth/UI reset.
        self._caption("session_reset", "")
        self.transcript = TranscriptLog()

    def run(self) -> None:
        """Blocks until stop(). Reconnects if the socket drops mid-demo."""
        failures = 0
        while not self._stop.is_set():
            if self._session_permission is not None and not self._session_permission.wait(0.2):
                continue
            started = time.monotonic()
            clean_end = self._run_session()
            if self._stop.is_set() or not self._reconnect:
                break
            if clean_end:
                failures = 0
                self._caption("status", "Ready for the next donor")
                self._stop.wait(2)
                continue
            if time.monotonic() - started > 30:
                failures = 0  # that was a real session, not a failed connect
            failures += 1
            if failures > MAX_RECONNECTS:
                log.error("Giving up after %d reconnect attempts.", MAX_RECONNECTS)
                break
            delay = min(2**failures, 15)
            log.warning("Session ended - reconnecting in %ds (Ctrl+C to quit).", delay)
            self._stop.wait(delay)
        self._print_summary()

    def stop(self) -> None:
        self._stop.set()

    def say_as_user(self, text: str) -> None:
        """Typed input: text mode, or a fallback when the hall is too loud for the mic."""
        conversation = self._live_conversation()
        if conversation is None:
            print("(not connected yet)")
            return
        try:
            conversation.send_user_message(text)
            self._handle_user_transcript(text, typed=True)
        except Exception as exc:
            log.warning("Could not send message: %s", exc)

    def _run_session(self) -> bool:
        ended = threading.Event()
        audio = None
        if not self._text_mode:
            audio = SpeakerMicInterface(on_interrupt=self._handle_interruption, **self._audio_kwargs)
        conversation = _Conversation(
            self._client,
            self._agent_id,
            requires_auth=True,  # signed URL via the API key; works for public agents too
            audio_interface=audio,
            client_tools=self._build_client_tools(),  # stop() kills its loop, so one per session
            callback_agent_response=self._handle_agent_response,
            callback_agent_response_correction=self._handle_agent_correction,
            callback_user_transcript=self._handle_user_transcript,
            callback_latency_measurement=lambda ms: log.debug("ping %d ms", ms),
            callback_end_session=ended.set,
        )
        with self._lock:
            for state in self._context.values():
                state[1] = False  # a new session starts with no memory: resend everything
        try:
            conversation.start_session()
        except Exception as exc:
            log.error("Could not start session (check ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID): %s", exc)
            conversation.end_session()
            self.reset_donor_session()
            return False

        self._conversation = conversation
        announced = False
        try:
            while not self._stop.wait(0.2):
                # The SDK has no "connected" callback and its socket thread
                # dies silently on a failed connect, hence the private peeks.
                if ended.is_set() or not conversation._thread.is_alive():
                    break
                if conversation._conversation_id and not announced:
                    announced = True
                    print(f"--- connected ({conversation._conversation_id}) ---")
                    self._caption("status", "Live")
                self._flush_context()
        finally:
            self._conversation = None
            conversation.end_session()
            conversation.wait_for_session_end()
            error = str(conversation.connect_error or "")
            if "quota_exceeded" in error:
                # Retrying cannot help and would just hammer the API.
                log.error("ElevenLabs account is out of credits: add credits or upgrade the plan, then restart.")
                self._caption("status", "ElevenLabs: out of credits")
                self._stop.set()
            elif not announced:
                log.error("Session never connected: %s", error or "network down, or the agent ID does not exist")
                self._caption("status", "Could not connect")
            else:
                self._caption("status", "Disconnected")
            self.reset_donor_session()
        return announced and ended.is_set() and not error

    def _live_conversation(self) -> Optional[Conversation]:
        """The conversation, but only once the handshake is done.

        The SDK exposes its socket before it has sent the initiation message,
        so anything we send earlier would jump ahead of the handshake.
        """
        conversation = self._conversation
        if conversation is not None and conversation._conversation_id:
            return conversation
        return None

    # ======================================================================
    # Context plumbing
    # ======================================================================
    def _set_context(self, channel: str, text: str) -> None:
        text = (text or "").strip()
        if not text:
            return
        with self._lock:
            state = self._context.get(channel)
            if state and state[0] == text:
                return  # unchanged since last frame: don't spend context window on it
            self._context[channel] = [text, False]
        self._flush_context()

    def _flush_context(self) -> None:
        """Send every unsent channel. Runs on push and on the session poll, so
        anything pushed before the socket was ready goes out as soon as it is."""
        conversation = self._live_conversation()
        if conversation is None:
            return
        with self._lock:
            pending = [(channel, state) for channel, state in self._context.items() if not state[1]]
            for channel, state in pending:
                try:
                    # Contextual updates are non-interrupting: the agent keeps
                    # talking and simply knows this from its next turn on.
                    conversation.send_contextual_update(f"[{channel}] {state[0]}")
                    state[1] = True
                    log.info("context -> agent  [%s] %s", channel, state[0])
                except Exception as exc:
                    log.debug("Contextual update deferred: %s", exc)
                    return

    def _snapshot(self, channel: str) -> Optional[str]:
        with self._lock:
            state = self._context.get(channel)
            return state[0] if state else None

    # ======================================================================
    # Client tools (run on the SDK's tool thread pool, never on audio threads)
    # ======================================================================
    def _build_client_tools(self) -> ClientTools:
        tools = ClientTools()
        tools.register("get_fridge_status", self._tool_get_fridge_status)
        tools.register("scan_donation_item", self._tool_scan_donation_item)
        tools.register("scan_product_barcode", self._tool_scan_product_barcode)
        tools.register("scan_expiration_date", self._tool_scan_expiration_date)
        tools.register("log_donation", self._tool_log_donation)
        tools.register("record_expiration_date", self._tool_record_expiration_date)
        tools.register("check_storage_suitability", self._tool_check_storage)
        tools.register("authenticate_pickup", self._tool_authenticate_pickup)
        tools.register("record_pickup", self._tool_record_pickup)
        return tools

    def _tool_get_fridge_status(self, params: dict) -> str:
        inventory = self._snapshot("FRIDGE VISION")
        conditions = self._snapshot("FRIDGE SENSORS")
        return (
            f"Inventory: {inventory or 'no camera data yet - say you cannot see inside right now'}. "
            f"Conditions: {conditions or 'no sensor data yet - say you cannot check the temperature right now'}."
        )

    def _tool_scan_donation_item(self, params: dict) -> str:
        hint = str(params.get("item_hint") or "").strip()
        if self._item_scanner is None:
            # Placeholder until the Gemini step registers set_item_scanner().
            return (
                "Camera vision is not connected yet. Ask the donor to tell you what the food is "
                "and how many there are, and go by what they say."
            )
        self._caption("notice", "")  # a new item: the last one's warning no longer applies
        self._caption("status", "Scanning item...")
        try:
            result = str(self._item_scanner(hint) or "").strip()
        except PlacementPending as exc:
            self._caption("notice", str(exc))
            return str(exc)
        except Exception as exc:
            # A scanner that raises is broken (as opposed to "saw nothing"):
            # don't make the donor keep holding things up to a dead camera.
            log.warning("Item scanner failed: %s", exc)
            return "The camera could not identify the item. " + self._after_failed_scan()
        finally:
            self._caption("status", "Live")
        self.transcript.add("scan", result, hint=hint)
        return result or "The camera could not make out what the item is. " + self._after_failed_scan()

    def _after_failed_scan(self) -> str:
        """What the agent should do when the item scan came back with nothing."""
        if self._barcode_scanner is None:
            return "Ask the donor to tell you what the food is and how many there are, and go by what they say."
        # Don't rely on the model to chain a second tool call after it has
        # spoken: start watching for a barcode right now, and deliver the
        # result as a [CAMERA RESULT] message when it lands.
        self._start_barcode_scan(announce_result=True)
        return (
            "The camera is now watching for a barcode. Say only: 'Can you turn the package so its barcode "
            "faces the camera?' Then wait: the result will arrive by itself as a [CAMERA RESULT] message. "
            "Do not call scan_product_barcode for this."
        )

    def _start_barcode_scan(self, announce_result: bool):
        """Run one bounded barcode scan off-thread. Single flight: a second request joins the first."""
        with self._lock:
            job = self._barcode_job
            if job is None or job.done():
                job = self._barcode_job = self._barcode_pool.submit(self._barcode_scan_job, announce_result, self._session_generation)
            elif not announce_result:
                # The agent asked for the scan that is already running: it
                # will get the answer as its tool result, so don't also send it.
                self._barcode_claimed = True
        return job

    def _barcode_scan_job(self, announce_result: bool, generation: int) -> str:
        self._barcode_claimed = not announce_result
        started = time.monotonic()
        self._caption("status", "Scanning barcode...")
        try:
            result = str(self._barcode_scanner() or "").strip()
        except Exception as exc:
            log.warning("Barcode scanner failed: %s", exc)
            result = ""
        finally:
            self._caption("status", "Live")
        if generation != self._session_generation:
            return "Discarded barcode from the previous donor session."
        result = result or "Barcode scanning is not available. Ask the donor to tell you what the product is."
        self.transcript.add("scan_barcode", result)
        if not self._barcode_claimed:
            # The agent is still saying "can you turn the package..."; a result
            # that lands mid-sentence would cut it off. Let it finish first.
            self._stop.wait(max(0.0, BARCODE_RESULT_MIN_DELAY_S - (time.monotonic() - started)))
            conversation = self._live_conversation()
            if conversation is not None and generation == self._session_generation:
                try:
                    conversation.send_user_message(f"[CAMERA RESULT] {result}")
                except Exception as exc:
                    log.warning("Could not deliver barcode result: %s", exc)
        return result

    def _tool_scan_product_barcode(self, params: dict) -> str:
        if self._barcode_scanner is None:
            return "Barcode scanning is not available. Ask the donor to tell you what the product is."
        return self._start_barcode_scan(announce_result=False).result()

    def _tool_scan_expiration_date(self, params: dict) -> str:
        item = str(params.get("item") or "").strip()
        today = f"Today's date is {datetime.now():%B %d, %Y}."
        if self._expiry_scanner is None:
            # Placeholder until the Gemini step registers set_expiry_scanner().
            return f"Camera vision is not connected yet. Ask the donor to read the expiration date to you. {today}"
        self._caption("status", "Reading date...")
        try:
            result = str(self._expiry_scanner(item) or "").strip()
        except Exception as exc:
            log.warning("Expiry scanner failed: %s", exc)
            return f"The camera could not read the date. Ask the donor to read the expiration date out loud. {today}"
        finally:
            self._caption("status", "Live")
        self.transcript.add("scan_expiry", result, item=item)
        if not result:
            return (
                f"The camera could not read the date clearly. Ask the donor to tell you the date aloud instead; do not force another scan. {today}"
            )
        with self._lock:
            self._expiration = {"text": result, "source": "camera", "confirmed": False}
        return f"Date on the package: {result}. Ask the donor to confirm this reading. {today}"

    def set_pickup_handlers(self, authenticate, store):
        self._pickup_authenticator, self._pickup_store = authenticate, store

    def _tool_check_storage(self, params):
        item = str(params.get('item') or '').strip()
        with self._lock:
            details = dict(self._pending_products[-1] if self._pending_products else {})
        label = str(params.get('storage_instructions') or '').strip()
        if params.get('donor_confirmed') is True and label:
            import re
            if re.search(r'keep refrigerated|refrigerate|refrigerated storage', label, re.I):
                self._storage_evidence = {'storage':'refrigerate', 'storage_source':'donor_reported_label', 'storage_label':label[:300]}
        verdict, reason = storage_verdict(item, {**details, **self._storage_evidence})
        self._caption('notice', reason)
        return f'Storage decision: {verdict}. {reason}'

    def _tool_authenticate_pickup(self, params):
        if self._pickup_authenticator is None:
            return 'Pickup authorization is unavailable. Ask the food-bank operator; do not take stock.'
        username = str(params.get('username') or '').strip()
        code = str(params.get('code') or '').replace(' ', '')
        if not username or len(code) != 6 or not code.isdigit():
            return 'Ask for the username and the six-digit code from the signed-in Missions page.'
        try:
            result = self._pickup_authenticator(username, code)
        except Exception:
            self._pickup_auth = None
            return 'Not authorized. The username/code may be invalid, expired or the shelf camera is unavailable. Sign in and generate a new code; do not take food yet.'
        self._pickup_auth = result
        self._caption('notice', f"Authorized pickup: {result['username']}")
        return 'Authenticated pickup: ' + json.dumps(result)

    def _tool_record_pickup(self, params):
        if self._pickup_auth is None or self._pickup_store is None:
            return 'Not recorded. Authenticate with a username and pickup code first.'
        if params.get('pickup_confirmed') is not True:
            return 'Ask the user to confirm that they have removed the requested food before recording.'
        product_id = str(params.get('product_id') or '')
        try:
            count = int(params.get('quantity'))
        except (TypeError, ValueError):
            return 'Ask for the number of individual units.'
        if type(params.get('quantity')) is bool or not 1 <= count <= 100:
            return 'Use a quantity from 1 to 100.'
        product = next((p for p in self._pickup_auth['inventory'] if p['product_id'] == product_id), None)
        if not product or count > product['recorded_quantity']:
            return 'Not recorded. Select a listed inventory product and an available quantity.'
        self._caption('status', 'Checking pickup on shelf camera...')
        try:
            result = self._pickup_store(self._pickup_auth, product, count)
        except PlacementPending as exc:
            return str(exc)
        except Exception:
            return 'Pickup was not saved. No points confirmed. Ask the operator to check the data connection, then retry.'
        finally:
            self._caption('status', 'Live')
        self._pickup_auth = None
        self._caption('donation', f"Pickup saved · {result['points_awarded']} mission points")
        return 'Pickup saved. ' + json.dumps(result) + ' This records pickup only, not completed delivery. End this pickup session.'

    def _tool_record_expiration_date(self, params: dict) -> str:
        if params.get("donor_confirmed") is not True:
            return "Date not saved. Read it back and ask the donor to confirm first."
        raw = str(params.get("date") or "").strip()
        try:
            value = datetime.strptime(raw, "%Y-%m-%d").date()
            if value.isoformat() != raw:
                raise ValueError("Use ISO date")
        except ValueError:
            return "Date not saved. Ask for a complete, unambiguous month, day and year. Never guess."
        with self._lock:
            self._expiration = {"text": raw, "date": raw, "source": "donor_reported", "confirmed": True}
        self._caption("notice", f"Expiration: {raw} (reported by donor)")
        if value < datetime.now().date():
            return "The donor-reported date is in the past. Do not accept this donation; ask for operator review."
        return f"Saved donor-reported expiration date {raw}. This was spoken, not read by the camera."

    def _tool_log_donation(self, params: dict) -> str:
        if params.get("placement_confirmed") is not True:
            return "Not recorded. Ask the donor to place the items inside and explicitly confirm that they have done so before recording."
        with self._lock:
            latest = self._pending_products[-1] if self._pending_products else {}
        latest = {**latest, **self._storage_evidence}
        verdict, reason = storage_verdict(str(params.get('items') or ''), latest)
        if verdict != 'yes':
            self._caption('notice', reason)
            return 'Not recorded. ' + reason
        items = str(params.get("items") or "").strip() or "unspecified items"
        try:
            count = max(1, int(float(params.get("item_count") or 1)))  # LLMs sometimes send "3" or 3.0
        except (TypeError, ValueError):
            count = 1
        record = {
            "items": items,
            "item_count": count,
            "donor_name": str(params.get("donor_name") or "").strip() or None,
            # Kept as a string: UPC codes start with zeros.
            "barcode": "".join(ch for ch in str(params.get("barcode") or "") if ch.isdigit()) or None,
            "ts": datetime.now().isoformat(timespec="seconds"),
        }
        with self._lock:
            record["products"] = list(self._pending_products)
            record["expiration"] = self._expiration
            record["storage_evidence"] = dict(self._storage_evidence)
        if record["expiration"] and record["expiration"].get("date", "9999-12-31") < datetime.now().date().isoformat():
            return "Not recorded: the reported expiration date is in the past. Ask for operator review."
        if self._donation_store is not None:
            self._caption("status", "Checking inside camera...")
            try:
                self._donation_store(record)
            except PlacementPending as exc:
                self._caption("notice", str(exc))
                return str(exc)
            except Exception:
                self._caption('notice','Donation was not saved: check the database connection.')
                return 'Donation was not saved. Ask the operator to check the database connection before retrying.'
            finally:
                self._caption('status', 'Live')
        with self._lock:
            self._pending_products = []
            self._expiration = None
            self._storage_evidence = {}
            self.donations.append(record)
        self.transcript.add("donation", items, **{k: v for k, v in record.items() if k not in ("items", "ts")})
        self._caption("product", "")
        print(f"  [donation] {count} item(s): {items} (saved)")
        self._caption("donation", f"Donation saved: {count} item(s)")
        self._notify(self._donation_listeners, record)
        return f"Saved {count} item(s): {items}. Thank the donor."

    # ======================================================================
    # Conversation events (run on the SDK's socket thread: keep them quick)
    # ======================================================================
    def _handle_user_transcript(self, text: str, typed: bool = False) -> None:
        if not text:
            return
        self.transcript.add("user", text, typed=typed)
        if not typed:
            print(f"    You: {text}")
        self._caption("user", text)
        self._notify(self._utterance_listeners, text)

    def _handle_agent_response(self, text: str) -> None:
        self.transcript.add("agent", text)
        print(f"Nourish: {text}")
        self._caption("agent", text)

    def _handle_agent_correction(self, original: str, corrected: str) -> None:
        # Sent after a barge-in: `corrected` is the part the person actually heard.
        self.transcript.add("agent_cut_off", corrected, intended=original)
        print(f"         (cut off after: {corrected!r})")
        self._caption("agent_cut_off", corrected)

    def _handle_interruption(self) -> None:
        self.transcript.add("interruption")

    def _caption(self, role: str, text: str) -> None:
        for listener in list(self._caption_listeners):
            try:
                listener(role, text)
            except Exception as exc:
                log.warning("Caption listener %r failed: %s", listener, exc)

    @staticmethod
    def _notify(listeners: list, payload) -> None:
        for listener in list(listeners):
            try:
                listener(payload)
            except Exception as exc:
                log.warning("Listener %r failed: %s", listener, exc)

    def _print_summary(self) -> None:
        log_ = self.transcript
        print(
            f"\n--- session over: {log_.count('user')} user turns, {log_.count('agent')} agent turns, "
            f"{log_.count('interruption')} interruptions, {len(self.donations)} donations ---\n"
            f"--- transcript: {log_.path} ---"
        )


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
CONSOLE_HELP = """\
Type to talk to Nourish as the user, or inject what Gemini / the sensors will send:
  /inv  <text>   inventory update        e.g. /inv 3 cans of beans, milk expires tomorrow
  /cond <text>   conditions update       e.g. /cond 3.9 C, 42% humidity, food-safe
  /ctx  <text>   any other silent context
  /alert <text>  spoken alert            e.g. /alert Temperature has risen to 9 C
  /quit
"""


def _console_loop(agent: FridgeVoiceAgent) -> None:
    commands = {
        "/inv": agent.update_inventory,
        "/cond": agent.update_conditions,
        "/ctx": agent.push_context,
        "/alert": agent.announce,
    }
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            command, _, rest = line.partition(" ")
            if command in ("/quit", "/exit", "/q"):
                agent.stop()
                return
            if command in commands:
                if rest.strip():
                    commands[command](rest)
                else:
                    print(f"usage: {command} <text>")
            elif command.startswith("/"):
                print(CONSOLE_HELP)
            else:
                agent.say_as_user(line)
    except Exception as exc:  # closed/non-interactive stdin must never take the voice loop down
        log.debug("Console input stopped: %s", exc)


def main() -> int:
    parser = argparse.ArgumentParser(description="Smart Food Bank Fridge voice agent (ElevenLabs)")
    parser.add_argument("--setup-agent", action="store_true", help="create/update the ElevenLabs agent, then exit")
    parser.add_argument("--text", action="store_true", help="text-only session: no mic, no speaker")
    parser.add_argument("--list-devices", action="store_true", help="list audio devices, then exit")
    parser.add_argument("--mic-test", action="store_true", help="print mic levels (to tune --gate-rms), then exit")
    parser.add_argument("--mic", default=os.getenv("FRIDGE_MIC_DEVICE", "Logitech"), help="input device index or name")
    parser.add_argument(
        "--speaker", default=os.getenv("FRIDGE_SPEAKER_DEVICE", "JBL"), help="output device index or name"
    )
    parser.add_argument("--echo-guard", choices=["gate", "mute", "off"], default=os.getenv("FRIDGE_ECHO_GUARD", "gate"))
    parser.add_argument("--gate-rms", type=float, default=float(os.getenv("FRIDGE_GATE_RMS", DEFAULT_GATE_RMS)))
    parser.add_argument("--no-reconnect", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )
    # A cp1252 console must not crash the demo over a curly quote in a transcript.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")

    if args.list_devices:
        print(sd.query_devices())
        return 0
    if args.mic_test:
        mic_test(resolve_device(args.mic, "input"))
        return 0

    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        log.error("ELEVENLABS_API_KEY is not set (put it in %s).", ENV_PATH)
        return 1
    client = ElevenLabs(api_key=api_key)

    if args.setup_agent:
        try:
            setup_agent(client)
        except Exception as exc:
            # Most often a scoped API key: agent setup needs the convai_write permission.
            log.error("Agent setup failed: %s", getattr(exc, "body", None) or exc)
            return 1
        return 0

    agent_id = os.getenv("ELEVENLABS_AGENT_ID")
    if not agent_id:
        log.error("ELEVENLABS_AGENT_ID is not set. Run:  python %s --setup-agent", Path(__file__).name)
        return 1

    agent = FridgeVoiceAgent(
        client,
        agent_id,
        text_mode=args.text,
        input_device=None if args.text else resolve_device(args.mic, "input"),
        output_device=None if args.text else resolve_device(args.speaker, "output"),
        echo_guard=args.echo_guard,
        gate_rms=args.gate_rms,
        reconnect=not args.no_reconnect,
    )
    print(CONSOLE_HELP)
    threading.Thread(target=_console_loop, args=(agent,), name="console", daemon=True).start()
    try:
        agent.run()
    except KeyboardInterrupt:
        agent.stop()
        agent.run()  # stop is already set: this only prints the summary
    return 0


if __name__ == "__main__":
    load_dotenv(ENV_PATH)
    sys.exit(main())
