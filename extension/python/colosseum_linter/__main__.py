"""CLI: ``python -m colosseum_linter --out <typings_dir>``."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .catalog import build_catalog
from .discover import discover_namespaces
from .generate import write_catalog, write_stub


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate Pylance stubs for Colosseum plugin namespaces.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Output directory (usually workspace typings/).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print a machine-readable summary on stdout.",
    )
    args = parser.parse_args(argv)

    capture = discover_namespaces()
    stub_path = write_stub(args.out, capture.namespaces)
    catalog = build_catalog(capture.namespace_modules)
    catalog_path = write_catalog(args.out, catalog)

    summary = {
        "stub_path": str(stub_path),
        "catalog_path": str(catalog_path),
        "namespaces": dict(sorted(capture.namespaces.items())),
        "catalog": catalog,
        "warnings": capture.warnings,
    }

    if args.json:
        print(json.dumps(summary))
    else:
        names = ", ".join(sorted(capture.namespaces)) or "(none)"
        print(f"Wrote {stub_path}")
        print(f"Wrote {catalog_path}")
        print(f"Namespaces: {names}")
        for warning in capture.warnings:
            print(f"Warning: {warning}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
