"""Discover Colosseum plugin namespaces from the active environment."""

from __future__ import annotations

import types
from dataclasses import dataclass, field
from importlib.metadata import entry_points
from typing import Any, Callable, Protocol, cast


class ColosseumPluginEntryPoint(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def value(self) -> str: ...

    def load(self) -> Callable[..., object]: ...


@dataclass
class CaptureRegistry:
    """Duck-typed registry that only records ``register_namespace`` calls."""

    namespaces: dict[str, str] = field(default_factory=dict)
    namespace_modules: dict[str, types.ModuleType] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def register_namespace(self, name: str, module: types.ModuleType) -> None:
        if name in self.namespaces:
            self.warnings.append(
                f"Namespace `{name}` already registered "
                f"(keeping {self.namespaces[name]}, ignoring {module.__name__})",
            )
            return
        self.namespaces[name] = module.__name__
        self.namespace_modules[name] = module

    def register_config_section(self, spec: Any) -> None:
        return None

    def register_shutdown(self, hook: Callable[[], None]) -> None:
        return None

    def register_listener(self, name: str, callback: Any) -> None:
        return None


def _discovered_for_group(group: str) -> list[ColosseumPluginEntryPoint]:
    discovered = entry_points()
    select = getattr(discovered, "select", None)
    if select is not None:
        return cast("list[ColosseumPluginEntryPoint]", list(select(group=group)))
    get = getattr(discovered, "get", None)
    if get is not None:
        return cast("list[ColosseumPluginEntryPoint]", list(get(group, [])))
    return cast(
        "list[ColosseumPluginEntryPoint]",
        [ep for ep in discovered if getattr(ep, "group", None) == group],
    )


def _dedupe_entry_points(
    discovered: list[ColosseumPluginEntryPoint],
) -> list[ColosseumPluginEntryPoint]:
    unique: list[ColosseumPluginEntryPoint] = []
    seen: set[tuple[str, str]] = set()
    for entry_point in discovered:
        key = (entry_point.name, str(getattr(entry_point, "value", "") or ""))
        if key in seen:
            continue
        seen.add(key)
        unique.append(entry_point)
    return unique


def entry_points_for_group(group: str = "colosseum.plugins") -> list[ColosseumPluginEntryPoint]:
    return _dedupe_entry_points(_discovered_for_group(group))


def discover_namespaces(
    group: str = "colosseum.plugins",
    *,
    registry: CaptureRegistry | None = None,
) -> CaptureRegistry:
    """Load each plugin ``register`` and capture namespace → module name maps."""

    capture = registry if registry is not None else CaptureRegistry()
    for ep in entry_points_for_group(group):
        try:
            plugin_register = ep.load()
            plugin_register(capture)
        except Exception as exc:  # noqa: BLE001 — one bad plugin must not abort others
            capture.warnings.append(f"Failed to load plugin `{ep.name}`: {exc}")
    return capture
