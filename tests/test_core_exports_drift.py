"""Guard stub core exports against colosseum.__all__ drift when core is installed."""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[1]
_PYTHON_ROOT = _ROOT / "extension" / "python"
if str(_PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(_PYTHON_ROOT))

from colosseum_linter.catalog import CORE_NAMES  # noqa: E402
from colosseum_linter.core_exports import CORE_EXPORT_LINES  # noqa: E402

colosseum = pytest.importorskip("colosseum")


def _names_mentioned_in_core_exports() -> set[str]:
    text = "\n".join(CORE_EXPORT_LINES)
    found: set[str] = set()
    # from ... import Name / import colosseum.X as name
    for match in re.finditer(r"\bas\s+([A-Za-z_]\w*)", text):
        found.add(match.group(1))
    for match in re.finditer(
        r"^\s+([A-Za-z_]\w*),?\s*$",
        text,
        flags=re.MULTILINE,
    ):
        found.add(match.group(1))
    for match in re.finditer(
        r"from\s+[\w.]+\s+import\s+([A-Za-z_]\w+)\s*$",
        text,
        flags=re.MULTILINE,
    ):
        found.add(match.group(1))
    found.add("__version__")
    # drop importlib alias
    found.discard("_metadata")
    return found


def test_core_names_match_colosseum_all() -> None:
    public = set(colosseum.__all__)
    assert CORE_NAMES == public, (
        f"catalog.CORE_NAMES drifted from colosseum.__all__.\n"
        f"only in CORE_NAMES: {sorted(CORE_NAMES - public)}\n"
        f"only in __all__: {sorted(public - CORE_NAMES)}"
    )


def test_core_export_lines_cover_all() -> None:
    mentioned = _names_mentioned_in_core_exports()
    public = set(colosseum.__all__)
    missing = public - mentioned
    assert not missing, (
        f"core_exports.py does not mention all of colosseum.__all__: {sorted(missing)}"
    )
