"""CLI skips overwriting stubs when every plugin entry point fails."""

from __future__ import annotations

import json
import sys
import types
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
_PYTHON_ROOT = _ROOT / "extension" / "python"
if str(_PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(_PYTHON_ROOT))

from colosseum_linter import __main__ as cli  # noqa: E402
from colosseum_linter.discover import CaptureRegistry  # noqa: E402


def test_skipped_write_when_all_plugins_fail(
    tmp_path: Path,
    monkeypatch,
    capsys,
) -> None:
    def fake_discover(*, group: str = "colosseum.plugins", registry=None):
        capture = registry if registry is not None else CaptureRegistry()
        capture.warnings.append("Failed to load plugin `broken`: boom")
        return capture

    monkeypatch.setattr(cli, "discover_namespaces", fake_discover)

    stub = tmp_path / "colosseum" / "__init__.pyi"
    stub.parent.mkdir(parents=True)
    stub.write_text("# previous good stub\n", encoding="utf-8")

    code = cli.main(["--out", str(tmp_path), "--json"])
    assert code == 0
    assert stub.read_text(encoding="utf-8") == "# previous good stub\n"
    summary = json.loads(capsys.readouterr().out.strip())
    assert summary["skipped_write"] is True
    assert summary["namespaces"] == {}
    assert summary["warnings"]


def test_writes_when_namespaces_present(tmp_path: Path, monkeypatch) -> None:
    api = types.ModuleType("ok.api")

    def fake_discover(*, group: str = "colosseum.plugins", registry=None):
        capture = registry if registry is not None else CaptureRegistry()
        capture.register_namespace("ok", api)
        return capture

    monkeypatch.setattr(cli, "discover_namespaces", fake_discover)
    code = cli.main(["--out", str(tmp_path), "--json"])
    assert code == 0
    stub = tmp_path / "colosseum" / "__init__.pyi"
    assert stub.is_file()
    assert "import ok.api as ok" in stub.read_text(encoding="utf-8")
    catalog = tmp_path / "colosseum_namespaces.json"
    assert catalog.is_file()
    data = json.loads(catalog.read_text(encoding="utf-8"))
    assert "ok" in data["namespaces"]
