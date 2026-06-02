"""Gemini 2.5 Flash Lite (via OpenRouter) caption + content classification.

WHY CATEGORY, NOT A keep BOOLEAN: Flash Lite describes images accurately but is
unreliable on the polarity of a yes/no "keep" flag (it confidently returned
keep:false for clearly-technical panels while its own reason said "not junk").
So the model only CLASSIFIES + captions — content it is good at — and OUR code
maps category -> keep. Bias is to KEEP: unknown/unparseable/error => keep."""
import base64
import json
import re
import urllib.request

from config import OPENROUTER_API_KEY, VISION_MODEL

# Categories we treat as junk (not useful as a technician-facing figure card).
JUNK_CATEGORIES = {"logo", "blank", "decoration", "text_only"}
CATEGORIES = [
    "diagram", "schematic", "photo_of_equipment", "control_panel", "table",
    "logo", "blank", "decoration", "text_only", "other",
]

PROMPT = (
    "Classify this image extracted from an industrial equipment manual, for a "
    "technician-facing figure gallery. Pick the single best category:\n"
    "- diagram, schematic, photo_of_equipment, control_panel, table: useful technical figures\n"
    "- logo: a company logo/branding\n"
    "- blank: blank or solid-color\n"
    "- decoration: pure page decoration / ornament\n"
    "- text_only: only running text / page numbers, no figure\n"
    "- other: anything else\n"
    "Then write a short factual caption (max 12 words) of what it shows. "
    'Reply ONLY with JSON: {"category": "<one-of-the-above>", "caption": "<caption>"}'
)

API_URL = "https://openrouter.ai/api/v1/chat/completions"


def keep_for_category(category: str) -> bool:
    """Map a category to keep/drop. Unknown category => keep (bias to keep)."""
    c = (category or "").strip().lower()
    if c not in CATEGORIES:
        return True
    return c not in JUNK_CATEGORIES


def parse_vision_json(text: str) -> dict:
    """Extract {keep, caption, reason} from the model reply. `reason` carries the
    category for the audit report. Unparseable => keep (never drop on ambiguity)."""
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return {"keep": True, "caption": "", "reason": "unparseable"}
    try:
        d = json.loads(m.group(0))
    except Exception:
        return {"keep": True, "caption": "", "reason": "unparseable"}
    category = str(d.get("category", "")).strip().lower()
    return {
        "keep": keep_for_category(category),
        "caption": str(d.get("caption", "")).strip(),
        "reason": category or "unspecified",
    }


def judge_and_caption(image_bytes: bytes) -> dict:
    """Classify + caption one PNG. Returns {keep, caption, reason}.
    No key, or any error => keep=True with a reason marker (never drops)."""
    if not OPENROUTER_API_KEY:
        return {"keep": True, "caption": "", "reason": "vision-skipped"}
    b64 = base64.b64encode(image_bytes).decode()
    body = {
        "model": VISION_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
        ]}],
        "temperature": 0,
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.loads(r.read())
        return parse_vision_json(data["choices"][0]["message"]["content"])
    except Exception as e:  # network / shape / quota — keep, surface the reason
        return {"keep": True, "caption": "", "reason": f"vision-error:{e}"}
