import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SAMPLE_DIR = ROOT / "sample_data"
OUT_DIR = ROOT / "ingest" / "out"
IMAGES_DIR = OUT_DIR / "images"

EMBED_PROVIDER = os.getenv("EMBED_PROVIDER", "local")  # local | bedrock
EMBED_MODEL = os.getenv("EMBED_MODEL", "BAAI/bge-base-en-v1.5")

# Chunking (RecursiveCharacterTextSplitter)
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "800"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "100"))

# Image-keep filter + page-render fallback trigger
MIN_IMG_W, MIN_IMG_H = 64, 64
FALLBACK_DRAW_MIN = 40  # vector drawings
FALLBACK_TEXT_MAX = 4000  # shorter text
RENDER_DPI = 150
# Perceptual-hash dedup: images within this Hamming distance (64-bit phash) are
# the same picture. Catches resized/re-encoded logos exact byte-hashing misses.
# 0 = identical; ~6-10 = near-dup.
PHASH_MAX_DIST = int(os.getenv("PHASH_MAX_DIST", "6"))

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
VISION_MODEL = os.getenv(
    "VISION_MODEL", "google/gemini-2.5-flash-lite"
)  # image qualit filter
VISION_WORKERS = int(os.getenv("VISION_WORKERS", "12"))  # vision calls run concurrently

ACCOUNT_ID = os.getenv("AWS_ACCOUNT_ID", "521170871988")
IMAGES_BUCKET = os.getenv("IMAGES_BUCKET", f"document-copilot-images-{ACCOUNT_ID}")
VECTORS_BUCKET = os.getenv("VECTORS_BUCKET", f"document-copilot-vectors-{ACCOUNT_ID}")
