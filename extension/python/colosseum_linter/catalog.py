"""Build a nested attribute catalog for lint diagnostics."""

from __future__ import annotations

import types
from typing import Any

# Keep aligned with colosseum/__init__.py ``__all__`` (non-plugin surface).
CORE_NAMES: frozenset[str] = frozenset(
    {
        "__version__",
        "config",
        "database",
        "command",
        "measurement",
        "verification",
        "CommandResult",
        "VerificationResult",
        "ProceduralFault",
        "auto_key",
        "endex",
        "load_parameter",
    },
)

_MAX_DEPTH = 3


def _public_names(obj: Any) -> list[str]:
    try:
        names = dir(obj)
    except Exception:  # noqa: BLE001
        return []
    return [n for n in names if not n.startswith("_")]


def _walk(obj: Any, *, depth: int) -> dict[str, Any]:
    """Return ``{name: {children: ...}}`` for public attributes."""

    children: dict[str, Any] = {}
    if depth <= 0:
        return children

    for name in _public_names(obj):
        try:
            value = getattr(obj, name)
        except Exception:  # noqa: BLE001
            children[name] = {"children": {}}
            continue
        if isinstance(value, types.ModuleType) and depth > 1:
            children[name] = {"children": _walk(value, depth=depth - 1)}
        else:
            # Callable / constant / class — treat as a leaf name that exists.
            children[name] = {"children": {}}
    return children


def build_catalog(namespace_modules: dict[str, types.ModuleType]) -> dict[str, Any]:
    """Catalog core names + discovered plugin namespace trees."""

    namespaces: dict[str, Any] = {}
    for name, module in sorted(namespace_modules.items()):
        namespaces[name] = {
            "module": module.__name__,
            "children": _walk(module, depth=_MAX_DEPTH),
        }
    return {
        "core_names": sorted(CORE_NAMES),
        "namespaces": namespaces,
    }
