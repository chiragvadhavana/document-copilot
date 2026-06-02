"""Local retrieval eval — Loads the FAISS index + sidecar and runs
queries to eyeball top-k quality before wiring the Node query path.
Run: ingest/.venv/bin/python ingest/search.py "how tight should the drive chain be"
"""
import json
import sys
import faiss
from config import OUT_DIR
from embedder import make_embedder

_emb = None
_index = None
_meta = None


def _load():
    global _emb, _index, _meta
    if _index is None:
        _emb = make_embedder()
        _index = faiss.read_index(str(OUT_DIR / "index.faiss"))
        _meta = json.loads((OUT_DIR / "metadata.json").read_text())


def search(query: str, k: int = 5):
    _load()
    qv = _emb.embed_query(query)
    scores, ids = _index.search(qv, k)
    hits = []
    for score, i in zip(scores[0], ids[0]):
        if i < 0:
            continue
        m = _meta[i]
        hits.append((float(score), m))
    return hits


def _fmt(score, m):
    typ = m["type"] + (f"/{m.get('embed_source')}" if m["type"] == "image" else "")
    where = f"{m['doc_id']} p{m['page']}"
    snippet = (m.get("caption") if m["type"] == "image" else m.get("text", ""))[:80]
    extra = f"  img={m['s3_key']}" if m["type"] == "image" else ""
    return f"  {score:.3f}  [{typ:14}] {where:28} {snippet!r}{extra}"


if __name__ == "__main__":
    queries = [" ".join(sys.argv[1:])] if len(sys.argv) > 1 else [
        "how tight should the drive chain be",            # -> 3/8" vertical slack
        "what are the possible causes when the machine won't drive",
        "show me the jacking screws",                     # -> image card
        "what size are the gearbox bolts",                # -> M12
        "where is the hydraulic oil filter located",      # -> seppim
        "external view of the MAX 50 tool carrier",       # -> page-render image
    ]
    for q in queries:
        print(f"\nQ: {q}")
        for score, m in search(q, 5):
            print(_fmt(score, m))
