"""Deterministic, network-free image-junk heuristics. Conservative by design:
only the unmistakable cases (near-uniform blank/black, banner-shaped logos).
Bias is always toward KEEP — the vision pass (caption.py) handles the rest."""
import numpy as np

BLANK_STD = 6.0          # mean per-channel std below this => effectively uniform
BANNER_ASPECT = 6.0      # width/height at/above this => banner strip
BANNER_MAX_H = 160       # ...and short => logo, not a diagram


def blank_score(arr: np.ndarray) -> float:
    """Mean per-channel std-dev. ~0 for a flat fill, large for real content."""
    a = arr.astype(np.float32)
    if a.ndim == 2:
        return float(a.std())
    return float(a.reshape(-1, a.shape[-1]).std(axis=0).mean())


def is_blank(arr: np.ndarray) -> bool:
    return blank_score(arr) < BLANK_STD


def is_banner(width: int, height: int) -> bool:
    if height <= 0:
        return False
    return (width / height) >= BANNER_ASPECT and height <= BANNER_MAX_H
