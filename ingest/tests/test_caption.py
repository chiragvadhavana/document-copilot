from caption import parse_vision_json, keep_for_category


def test_keep_for_technical_categories():
    for c in ["diagram", "schematic", "photo_of_equipment", "control_panel", "table"]:
        assert keep_for_category(c) is True


def test_drop_for_junk_categories():
    for c in ["logo", "blank", "decoration", "text_only"]:
        assert keep_for_category(c) is False


def test_unknown_category_keeps():
    assert keep_for_category("weird-thing") is True
    assert keep_for_category("") is True
    assert keep_for_category("other") is True


def test_parse_keep_diagram():
    out = parse_vision_json('{"category": "diagram", "caption": "Wiring diagram"}')
    assert out["keep"] is True and out["caption"] == "Wiring diagram" and out["reason"] == "diagram"


def test_parse_drop_logo():
    out = parse_vision_json('{"category": "logo", "caption": "Gorbel logo"}')
    assert out["keep"] is False and out["reason"] == "logo"


def test_parse_json_inside_prose():
    out = parse_vision_json('```json\n{"category": "table", "caption": "Fault table"}\n```')
    assert out["keep"] is True and out["caption"] == "Fault table"


def test_parse_garbage_defaults_to_keep():
    out = parse_vision_json("sorry I can't")
    assert out["keep"] is True
