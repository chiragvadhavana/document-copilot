"""Probe sample PDFs to tune ingestion heuristics (image size filter, page-render
fallback threshold, caption availability). Read-only inspection, writes nothing.
Run: ingest/.venv/bin/python ingest/probe.py
"""
import sys
from pathlib import Path
import fitz  # PyMuPDF

SAMPLE_DIR = Path(__file__).resolve().parent.parent / "sample_data"
MIN_W, MIN_H = 64, 64  # candidate min-size filter for "real" images (tune here)


def nearest_text(page, rect):
    """Closest text block to an image rect — caption candidate."""
    best, best_d = None, 1e9
    for x0, y0, x1, y1, txt, *_ in page.get_text("blocks"):
        if not txt.strip():
            continue
        # vertical gap between block and image (prefer block just below/above)
        d = min(abs(y0 - rect.y1), abs(rect.y0 - y1))
        if d < best_d:
            best, best_d = txt.strip().replace("\n", " "), d
    return (best or "")[:90]


def probe(pdf_path):
    doc = fitz.open(pdf_path)
    print(f"\n{'='*70}\n{pdf_path.name}  —  {doc.page_count} pages")
    pages_with_img = pages_fallback = total_imgs = total_kept = 0
    for pno in range(doc.page_count):
        page = doc[pno]
        text_len = len(page.get_text())
        imgs = page.get_images(full=True)
        kept = []
        for img in imgs:
            xref = img[0]
            try:
                pix = fitz.Pixmap(doc, xref)
                w, h = pix.width, pix.height
            except Exception:
                w, h = img[2], img[3]
            if w >= MIN_W and h >= MIN_H:
                kept.append((xref, w, h))
        ndraw = len(page.get_drawings())
        total_imgs += len(imgs)
        total_kept += len(kept)
        if kept:
            pages_with_img += 1
        elif ndraw > 40 and text_len < 4000:
            pages_fallback += 1  # graphical, no embedded image -> render candidate
        # detail for first 6 pages
        if pno < 6:
            cap = ""
            if kept:
                rects = page.get_image_rects(kept[0][0])
                if rects:
                    cap = nearest_text(page, rects[0])
            print(f"  p{pno:>3} text={text_len:>5}  imgs={len(imgs)}(kept {len(kept)})"
                  f"  draws={ndraw:>4}" + (f"  cap='{cap}'" if cap else ""))
    print(f"  SUMMARY: pages_with_kept_img={pages_with_img}  "
          f"fallback_candidates={pages_fallback}  "
          f"raw_imgs={total_imgs} kept={total_kept}")
    doc.close()


if __name__ == "__main__":
    pdfs = sorted(SAMPLE_DIR.glob("*.pdf"))
    if not pdfs:
        sys.exit(f"no PDFs in {SAMPLE_DIR}")
    for p in pdfs:
        probe(p)
