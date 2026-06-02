"""EmbeddingAdapter (Python side). Local FastEmbed bge-large now; Bedrock Titan replacable with EmbeddingAdapter. Vectors L2-normalized so a FAISS inner-product
index == cosine similarity. Query side (Node) must use the SAME model."""
from typing import List
import numpy as np


class LocalEmbedder:
    provider = "local"

    def __init__(self, model: str):
        from fastembed import TextEmbedding
        self.model = model
        self._m = TextEmbedding(model_name=model)
        self.dim = next(d["dim"] for d in TextEmbedding.list_supported_models()
                        if d["model"] == model)

    @staticmethod
    def _norm(vecs: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return vecs / norms

    def embed(self, texts: List[str]) -> np.ndarray:
        """Passage embedding (for ingestion)."""
        return self._norm(np.asarray(list(self._m.embed(texts)), dtype="float32"))

    def embed_query(self, text: str) -> np.ndarray:
        """Query embedding — bge prepends a retrieval instruction prefix."""
        return self._norm(np.asarray(list(self._m.query_embed([text])), dtype="float32"))


def make_embedder():
    from config import EMBED_PROVIDER, EMBED_MODEL
    if EMBED_PROVIDER == "bedrock":
        raise NotImplementedError("Titan adapter pending AWS quota unblock (D019)")
    return LocalEmbedder(EMBED_MODEL)
