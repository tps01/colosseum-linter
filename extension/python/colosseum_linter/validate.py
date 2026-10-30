"""Path validation shared with the extension's diagnostic rules (tested here)."""

from __future__ import annotations

from typing import Any


def validate_path(
    parts: list[str],
    catalog: dict[str, Any],
) -> tuple[bool, int | None, str | None]:
    """Return ``(ok, bad_index, message)`` for a dotted path after ``col``."""

    if not parts:
        return True, None, None

    first = parts[0]
    core = set(catalog.get("core_names", []))
    namespaces: dict[str, Any] = catalog.get("namespaces", {})

    if first in core:
        return True, None, None

    ns_node = namespaces.get(first)
    if ns_node is None:
        known = ", ".join(sorted(namespaces)) or "(none)"
        return (
            False,
            0,
            f"Unknown Colosseum namespace '{first}'. "
            f"Installed plugin namespaces: {known}. "
            f"Install the plugin package or run Colosseum: Refresh namespace stubs.",
        )

    node: dict[str, Any] = ns_node
    for i in range(1, len(parts)):
        segment = parts[i]
        children: dict[str, Any] = node.get("children") or {}
        if segment not in children:
            available = sorted(children)[:12]
            hint = f" Known names: {', '.join(available)}{'…' if len(children) > 12 else ''}." if available else ""
            prefix = ".".join(["col", *parts[:i]])
            return False, i, f"'{segment}' is not a known attribute of {prefix}.{hint}"
        node = children[segment]
    return True, None, None
