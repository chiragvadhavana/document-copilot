import numpy as np
from quality import blank_score, is_blank, is_banner


def test_blank_score_zero_for_uniform():
    arr = np.zeros((100, 100, 3), dtype=np.uint8)        # all black
    assert blank_score(arr) < 1.0


def test_blank_score_high_for_varied():
    rng = np.random.default_rng(0)
    arr = (rng.random((100, 100, 3)) * 255).astype(np.uint8)
    assert blank_score(arr) > 20.0


def test_is_blank_true_for_black():
    assert is_blank(np.zeros((50, 50, 3), dtype=np.uint8)) is True


def test_is_blank_true_for_near_white():
    assert is_blank(np.full((50, 50, 3), 254, dtype=np.uint8)) is True


def test_is_blank_false_for_diagram_like():
    arr = np.zeros((50, 50, 3), dtype=np.uint8)
    arr[10:40, 10:40] = 200                              # a shape on background
    assert is_blank(arr) is False


def test_is_banner_true_for_wide_short():
    assert is_banner(1200, 90) is True                   # logo strip


def test_is_banner_false_for_diagram():
    assert is_banner(640, 480) is False
