"""Tests for catalog build + path validation (lint rules)."""

from __future__ import annotations

import sys
import types
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
_PYTHON_ROOT = _ROOT / "extension" / "python"
if str(_PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(_PYTHON_ROOT))

from colosseum_linter.catalog import CORE_NAMES, build_catalog  # noqa: E402
from colosseum_linter.generate import write_catalog  # noqa: E402
from colosseum_linter.validate import validate_path  # noqa: E402


def _fake_tree() -> types.ModuleType:
    leaf = types.ModuleType("fake.api.vsg")
    leaf.set_frequency = lambda **kw: None  # type: ignore[attr-defined]
    leaf.set_power = lambda **kw: None  # type: ignore[attr-defined]

    api = types.ModuleType("fake.api")
    api.vsg = leaf  # type: ignore[attr-defined]
    api.helper = lambda: None  # type: ignore[attr-defined]
    return api


def test_build_catalog_nested() -> None:
    catalog = build_catalog({"fake": _fake_tree()})
    assert "config" in catalog["core_names"]
    assert set(CORE_NAMES) <= set(catalog["core_names"])
    children = catalog["namespaces"]["fake"]["children"]
    assert "vsg" in children
    assert "set_frequency" in children["vsg"]["children"]
    assert "helper" in children


def test_validate_unknown_namespace() -> None:
    catalog = build_catalog({"fake": _fake_tree()})
    ok, idx, msg = validate_path(["nope", "x"], catalog)
    assert ok is False
    assert idx == 0
    assert msg is not None
    assert "Unknown Colosseum namespace" in msg
    assert "fake" in msg


def test_validate_unknown_attribute() -> None:
    catalog = build_catalog({"fake": _fake_tree()})
    ok, idx, msg = validate_path(["fake", "vsg", "nope"], catalog)
    assert ok is False
    assert idx == 2
    assert msg is not None
    assert "nope" in msg
    assert "set_frequency" in msg


def test_validate_known_path() -> None:
    catalog = build_catalog({"fake": _fake_tree()})
    ok, idx, msg = validate_path(["fake", "vsg", "set_frequency"], catalog)
    assert ok is True
    assert idx is None
    assert msg is None


def test_validate_core_name_ok() -> None:
    catalog = build_catalog({})
    ok, _, _ = validate_path(["config"], catalog)
    assert ok is True


def test_write_catalog(tmp_path: Path) -> None:
    catalog = build_catalog({"fake": _fake_tree()})
    path = write_catalog(tmp_path, catalog)
    assert path.name == "colosseum_namespaces.json"
    assert path.is_file()
    assert "fake" in path.read_text(encoding="utf-8")
