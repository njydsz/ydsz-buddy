"""tests/unit/users/test_preferences.py"""

from __future__ import annotations

import pytest

from ydsz.infra.errors import ErrorCode, YdszError
from ydsz.infra.users.preferences import (
    DEFAULT_NAV_ZONES,
    MOVABLE_NAV_KEYS,
    ModelReasoningPreference,
    get_model_reasoning_from_json,
    get_nav_zones_from_json,
    get_preferred_model_from_json,
    get_remote_browser_bookmarks_from_json,
    get_sidebar_nav_from_json,
    get_timezone_from_preferences_json,
    merge_model_preferences_json,
    merge_nav_zones_json,
    merge_preferences_json,
    merge_sidebar_nav_json,
    validate_nav_zones,
    validate_remote_browser_bookmarks,
    validate_sidebar_nav,
)


def test_validate_normalizes_and_dedupes_urls() -> None:
    items = [
        {"url": "example.com", "title": "A"},
        {"url": "https://example.com", "title": "B"},
        {"url": "https://other.test", "title": "Other"},
    ]
    out = validate_remote_browser_bookmarks(items)
    assert len(out) == 2
    assert out[0].url == "https://example.com"
    assert out[0].title == "A"
    assert out[1].url == "https://other.test"


def test_validate_skips_invalid_urls() -> None:
    out = validate_remote_browser_bookmarks(
        [{"url": "ftp://bad", "title": "x"}, {"url": "", "title": "y"}]
    )
    assert out == []


def test_validate_title_fallback_to_hostname() -> None:
    out = validate_remote_browser_bookmarks([{"url": "https://cloud.tencent.com", "title": ""}])
    assert out[0].title == "cloud.tencent.com"


def test_validate_rejects_over_limit() -> None:
    items = [{"url": f"https://site{i}.test", "title": f"S{i}"} for i in range(13)]
    with pytest.raises(YdszError) as ei:
        validate_remote_browser_bookmarks(items)
    assert ei.value.code is ErrorCode.SLASH_BAD_ARGS


def test_get_remote_browser_bookmarks_from_json_roundtrip() -> None:
    raw = merge_preferences_json(
        "{}",
        validate_remote_browser_bookmarks(
            [{"url": "https://a.test", "title": "A"}],
        ),
    )
    out = get_remote_browser_bookmarks_from_json(raw)
    assert len(out) == 1
    assert out[0].url == "https://a.test"


def test_get_remote_browser_bookmarks_from_json_invalid_payload() -> None:
    assert get_remote_browser_bookmarks_from_json("not-json") == []
    assert get_remote_browser_bookmarks_from_json('{"remote_browser_bookmarks": "x"}') == []


def test_get_timezone_from_preferences_json() -> None:
    assert (
        get_timezone_from_preferences_json('{"timezone":"Asia/Shanghai","x":1}') == "Asia/Shanghai"
    )
    assert get_timezone_from_preferences_json('{"timezone":"   "}') is None
    assert get_timezone_from_preferences_json('{"x":1}') is None
    assert get_timezone_from_preferences_json("not-json") is None


def test_merge_preserves_other_keys() -> None:
    merged = merge_preferences_json(
        '{"foo": 1}',
        validate_remote_browser_bookmarks(
            [{"url": "https://a.test", "title": "A"}],
        ),
    )
    import json

    data = json.loads(merged)
    assert data["foo"] == 1
    assert len(data["remote_browser_bookmarks"]) == 1


def test_model_preferences_roundtrip_and_preserve_other_keys() -> None:
    merged = merge_model_preferences_json(
        '{"foo":1}',
        preferred_model="token/glm-5",
        model_reasoning={"token/glm-5": ModelReasoningPreference(mode="enabled", effort="high")},
    )
    assert get_preferred_model_from_json(merged) == "token/glm-5"
    assert get_model_reasoning_from_json(merged)["token/glm-5"] == ModelReasoningPreference(
        mode="enabled",
        effort="high",
    )


def test_sidebar_nav_roundtrip_preserves_other_keys() -> None:
    layout = {
        "groups": [
            {"id": "settings", "name": "配置"},
            {"id": "c_aabbccdd11223344", "name": "常用"},
        ],
        "items": [
            {"key": "chat"},
            {"key": "personalization", "group": "settings"},
            {"key": "tasks", "hidden": True, "group": "settings"},
        ],
    }
    merged = merge_sidebar_nav_json('{"foo": 1}', layout)
    saved = get_sidebar_nav_from_json(merged)
    assert saved is not None
    assert saved["groups"][0] == {"id": "settings", "name": "配置"}
    assert saved["groups"][1]["id"] == "c_aabbccdd11223344"
    hidden = next(item for item in saved["items"] if item["key"] == "tasks")
    assert hidden == {"key": "tasks", "hidden": True}
    assert '"foo": 1' in merged or '"foo":1' in merged


def test_sidebar_nav_rejects_unknown_item_and_dangling_group() -> None:
    with pytest.raises(YdszError) as ei:
        validate_sidebar_nav({"groups": [], "items": [{"key": "not-a-nav"}]})
    assert ei.value.code is ErrorCode.SLASH_BAD_ARGS
    with pytest.raises(YdszError):
        validate_sidebar_nav({"groups": [], "items": [{"key": "chat", "group": "settings"}]})
    with pytest.raises(YdszError):
        validate_sidebar_nav({"groups": [{"id": "c_short", "name": "X"}], "items": []})


def test_sidebar_nav_clear_and_invalid_payload() -> None:
    merged = merge_sidebar_nav_json("{}", {"groups": [], "items": [{"key": "chat"}]})
    cleared = merge_sidebar_nav_json(merged, None)
    assert get_sidebar_nav_from_json(cleared) is None
    assert get_sidebar_nav_from_json('{"sidebar_nav": "nope"}') is None
    assert get_sidebar_nav_from_json("{}") is None


def test_nav_zones_defaults_cover_all_movable_keys() -> None:
    assert set(DEFAULT_NAV_ZONES.keys()) == set(MOVABLE_NAV_KEYS)
    for zone in DEFAULT_NAV_ZONES.values():
        assert zone in {"sidebar", "settings"}


def test_validate_nav_zones_rejects_invalid_zone() -> None:
    with pytest.raises(YdszError) as ei:
        validate_nav_zones({"models": "everywhere"})
    assert ei.value.code is ErrorCode.SLASH_BAD_ARGS


def test_validate_nav_zones_drops_unknown_keys() -> None:
    cleaned = validate_nav_zones({"models": "settings", "chat": "sidebar"})
    assert cleaned == {"models": "settings"}


def test_validate_nav_zones_normalizes_case() -> None:
    cleaned = validate_nav_zones({"models": "SETTINGS"})
    assert cleaned == {"models": "settings"}


def test_nav_zones_roundtrip_and_preserve_other_keys() -> None:
    merged = merge_nav_zones_json('{"foo": 1}', {"models": "sidebar"})
    import json

    data = json.loads(merged)
    assert data["foo"] == 1
    assert get_nav_zones_from_json(merged)["models"] == "sidebar"


def test_nav_zones_get_defaults_when_unset() -> None:
    assert get_nav_zones_from_json("{}")["models"] == "settings"
    assert get_nav_zones_from_json('{"nav_zones": null}')["models"] == "settings"


def test_nav_zones_clear_via_null() -> None:
    merged = merge_nav_zones_json("{}", {"models": "sidebar"})
    cleared = merge_nav_zones_json(merged, None)
    assert get_nav_zones_from_json(cleared) == DEFAULT_NAV_ZONES


def test_nav_zones_rejects_non_dict() -> None:
    with pytest.raises(YdszError) as ei:
        validate_nav_zones(["models"])
    assert ei.value.code is ErrorCode.SLASH_BAD_ARGS
