"""Ingestion entrypoint. Extract all sample PDFs -> embed -> FAISS index +
metadata sidecar + manifest, written to ingest/out/. S3 upload is a separate
step (upload.py) so the hard part iterates without AWS round-trips.
Run: ingest/.venv/bin/python ingest/ingest.py
"""
import json
import faiss
from config import SAMPLE_DIR, OUT_DIR, IMAGES_DIR
from embedder import make_embedder
from extract import extract_pdf, slug, get_decisions


def main():
    pdfs = sorted(SAMPLE_DIR.glob("*.pdf"))
    if not pdfs:
        raise SystemExit(f"no PDFs in {SAMPLE_DIR}")

    emb = make_embedder()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    all_recs, manifest = [], []
    for pdf in pdfs:
        doc_id = slug(pdf.stem)
        text_recs, image_recs = extract_pdf(pdf, doc_id, IMAGES_DIR)
        all_recs += text_recs + image_recs
        manifest.append({"doc_id": doc_id, "filename": pdf.name,
                         "text_vectors": len(text_recs),
                         "image_vectors": len(image_recs)})
        print(f"  {pdf.name}: {len(text_recs)} text + {len(image_recs)} image vectors")

    # Image-gate review. Eyeball every keep:false before
    # trusting the rebuilt index — originals stay on disk, flip a flag to re-include.
    decisions = get_decisions()
    (OUT_DIR / "review_report.json").write_text(json.dumps(decisions, indent=2))
    dropped = [d for d in decisions if not d["keep"]]
    print(f"\n[review] {len(decisions)} images gated, {len(dropped)} flagged as junk -> "
          f"{OUT_DIR / 'review_report.json'} (originals kept; index excludes flagged)")
    for d in dropped:
        print(f"    drop  {d['file']}  ({d['reason']})")

    texts = [r.text for r in all_recs]
    print(f"embedding {len(texts)} vectors with {emb.model} (first run downloads model)...")
    vecs = emb.embed(texts)

    index = faiss.IndexFlatIP(emb.dim)
    index.add(vecs)
    faiss.write_index(index, str(OUT_DIR / "index.faiss"))
    # raw float32 vectors for the Node query path (brute-force JS cosine, no faiss-node)
    vecs.astype("float32").tofile(OUT_DIR / "vectors.f32")
    (OUT_DIR / "metadata.json").write_text(json.dumps([r.metadata for r in all_recs]))
    (OUT_DIR / "manifest.json").write_text(json.dumps(
        {"embed_model": emb.model, "dim": emb.dim, "docs": manifest}, indent=2))

    print(f"\nindex: {index.ntotal} vectors, dim={emb.dim} -> {OUT_DIR}")
    print(f"images -> {IMAGES_DIR}")


if __name__ == "__main__":
    main()
