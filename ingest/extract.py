"""PDF -> embeddable records. Raw PyMuPDF for images (bytes + bbox), LangChain
splitter for text, page-render fallback for vector-drawn diagrams, dual-embed
(caption + page) per image."""
import hashlib
import io
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
import fitz
import imagehash
import numpy as np
from PIL import Image
from langchain_text_splitters import RecursiveCharacterTextSplitter
from config import (CHUNK_SIZE, CHUNK_OVERLAP, MIN_IMG_W, MIN_IMG_H,
                    FALLBACK_DRAW_MIN, FALLBACK_TEXT_MAX, RENDER_DPI, VISION_WORKERS,
                    PHASH_MAX_DIST)
from quality import is_blank, is_banner
from caption import judge_and_caption

_splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE,
                                           chunk_overlap=CHUNK_OVERLAP)

# Per-run image-gate audit trail. Non-destructive: every saved image gets an
# entry (keep + reason + display_caption); ingest.py writes it to review_report.json
# for human review. Files are NEVER deleted — junk is just excluded from the index.
DECISIONS: list[dict] = []


def get_decisions() -> list[dict]:
    return DECISIONS


def _pre_gate(fp: Path, width: int, height: int) -> str | None:
    """Deterministic, free pre-filter. Returns a drop-reason if the image is
    unmistakably junk (banner-logo / blank), else None => send it to the vision
    model. Conservative: only the obvious cases."""
    if is_banner(width, height):
        return "banner/logo aspect"
    arr = np.asarray(Image.open(fp).convert("RGB"))
    if is_blank(arr):
        return "blank/near-uniform"
    return None


def _classify(fp: Path) -> dict:
    """Vision verdict for one already-saved PNG. Robust: errors => keep."""
    try:
        v = judge_and_caption(fp.read_bytes())
    except Exception as e:  # never let one image abort the run
        v = {"keep": True, "caption": "", "reason": f"classify-error:{e}"}
    return v


@dataclass
class Record:
    id: str
    text: str          # the text actually embedded
    metadata: dict     # carried into the FAISS sidecar; returned at query time


def slug(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", name).strip("-").lower()


def _save_png(pix, fp):
    """PNG needs gray/RGB and no alpha here. Normalize any pixmap (CMYK, DeviceN,
    masks, RGBA) -> drop alpha, force gray/RGB."""
    if pix.alpha:
        pix = fitz.Pixmap(pix, 0)  # remove alpha channel
    if pix.colorspace is None or pix.colorspace.n not in (1, 3):
        pix = fitz.Pixmap(fitz.csRGB, pix)
    try:
        pix.save(fp)
    except Exception:
        p = fitz.Pixmap(fitz.csRGB, pix)        # absolute fallback: force RGB
        if p.alpha:
            p = fitz.Pixmap(p, 0)
        p.save(fp)


def _phash(pix):
    """Perceptual hash of a pixmap for near-duplicate detection. Exact byte
    hashing misses the same logo re-encoded or resized per page; phash collapses
    them. pix -> PNG bytes -> PIL -> 64-bit phash. Returns None on any decode
    failure (odd colorspace) so a bad image is simply kept, never aborts the run."""
    try:
        return imagehash.phash(Image.open(io.BytesIO(pix.tobytes("png"))))
    except Exception:
        return None


def _nearest_text(page, rect) -> str:
    """Closest non-empty text block to an image rect — caption candidate.
    Skip header/footer bands (top/bottom 10%) so the running page header isn't
    mistaken for a figure caption."""
    h = page.rect.height
    top, bot = 0.10 * h, 0.90 * h
    best, best_d = "", 1e9
    for x0, y0, x1, y1, txt, *_ in page.get_text("blocks"):
        if not txt.strip():
            continue
        if y1 < top or y0 > bot:          # in header/footer band -> skip
            continue
        d = min(abs(y0 - rect.y1), abs(rect.y0 - y1))
        if d < best_d:
            best, best_d = txt.strip().replace("\n", " "), d
    return best[:120]


def _image_records(image_id, key, bbox, caption, page_text, doc_id, pno, rendered):
    """Dual-embed: caption vector (precise) + page vector (recall). D004."""
    base = {"doc_id": doc_id, "page": pno, "type": "image", "s3_key": key,
            "bbox": bbox, "image_id": image_id, "caption": caption,
            "rendered": rendered}
    cap_text = caption or page_text[:200] or f"figure on page {pno + 1}"
    recs = [Record(f"{image_id}:cap", cap_text,
                   {**base, "embed_source": "caption", "text": cap_text})]
    if page_text.strip():
        pg = page_text[:1000]
        recs.append(Record(f"{image_id}:page", pg,
                           {**base, "embed_source": "page", "text": pg}))
    return recs


def extract_pdf(path: Path, doc_id: str, images_dir: Path):
    doc = fitz.open(path)
    text_recs, image_recs = [], []
    seen_phash = []   # per-doc perceptual hashes; near-dup logos/banners collapse
    seen_exact = set()  # md5 fallback for images phash can't decode (odd colorspace)
    candidates = []      # images that passed the deterministic pre-gate -> need vision
    out = images_dir / doc_id

    for pno in range(doc.page_count):
        page = doc[pno]
        page_text = page.get_text()

        # --- text channel ---
        for ci, chunk in enumerate(_splitter.split_text(page_text)):
            text_recs.append(Record(
                f"{doc_id}:p{pno}:c{ci}", chunk,
                {"doc_id": doc_id, "page": pno, "type": "text",
                 "chunk_index": ci, "text": chunk}))

        # --- image channel: embedded rasters (size-filtered) ---
        kept = []
        for img in page.get_images(full=True):
            xref = img[0]
            try:
                pix = fitz.Pixmap(doc, xref)
            except Exception:
                continue
            if pix.width < MIN_IMG_W or pix.height < MIN_IMG_H:
                continue
            ph = _phash(pix)                 # perceptual: catches resized/re-encoded dups
            if ph is not None:
                if any(ph - seen <= PHASH_MAX_DIST for seen in seen_phash):
                    continue                 # near-dup of an image already kept this doc
                seen_phash.append(ph)
            else:                            # phash decode failed -> exact-byte fallback
                digest = hashlib.md5(pix.samples).hexdigest()
                if digest in seen_exact:
                    continue
                seen_exact.add(digest)
            kept.append((xref, pix))

        if kept:
            for idx, (xref, pix) in enumerate(kept):
                out.mkdir(parents=True, exist_ok=True)
                fp = out / f"p{pno}_i{idx}.png"
                _save_png(pix, fp)
                rects = page.get_image_rects(xref)
                bbox = [round(v, 1) for v in rects[0]] if rects else None
                caption = _nearest_text(page, rects[0]) if rects else ""
                candidates.append({
                    "fp": fp, "w": pix.width, "h": pix.height,
                    "image_id": f"{doc_id}:p{pno}:i{idx}",
                    "key": f"images/{doc_id}/p{pno}_i{idx}.png",
                    "bbox": bbox, "caption": caption, "page_text": page_text,
                    "pno": pno, "rendered": False})

        # --- fallback: graphical page w/ no embedded image -> render page ---
        elif (len(page.get_drawings()) > FALLBACK_DRAW_MIN
              and len(page_text) < FALLBACK_TEXT_MAX):
            out.mkdir(parents=True, exist_ok=True)
            fp = out / f"p{pno}_render.png"
            rpix = page.get_pixmap(dpi=RENDER_DPI)
            rpix.save(fp)
            first = page_text.strip().split("\n")[0] if page_text.strip() else ""
            candidates.append({
                "fp": fp, "w": rpix.width, "h": rpix.height,
                "image_id": f"{doc_id}:p{pno}:render",
                "key": f"images/{doc_id}/p{pno}_render.png",
                "bbox": [round(v, 1) for v in page.rect],
                "caption": (first or f"diagram on page {pno + 1}")[:120],
                "page_text": page_text, "pno": pno, "rendered": True})

    doc.close()

    # --- gate: deterministic pre-filter (free), then vision concurrently ---
    need_vision = []
    for c in candidates:
        reason = _pre_gate(c["fp"], c["w"], c["h"])
        if reason:                       # deterministically junk -> drop, no vision call
            DECISIONS.append({"file": str(c["fp"]), "keep": False,
                              "reason": reason, "display_caption": ""})
        else:
            need_vision.append(c)

    # one hung call can't stall the run: bounded pool, per-call timeout in caption.py
    if need_vision:
        with ThreadPoolExecutor(max_workers=VISION_WORKERS) as ex:
            verdicts = list(ex.map(_classify, [c["fp"] for c in need_vision]))
    else:
        verdicts = []

    for c, v in zip(need_vision, verdicts):
        disp_cap = v["caption"]
        DECISIONS.append({"file": str(c["fp"]), "keep": v["keep"],
                          "reason": v["reason"], "display_caption": disp_cap})
        if not v["keep"]:                # leave file on disk, just skip the index
            continue
        recs = _image_records(c["image_id"], c["key"], c["bbox"], c["caption"],
                              c["page_text"], doc_id, c["pno"], rendered=c["rendered"])
        for r in recs:                   # display-only; embeddings unchanged
            r.metadata["display_caption"] = disp_cap
        image_recs += recs

    return text_recs, image_recs
