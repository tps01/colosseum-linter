"""Static ``colosseum`` public API lines mirrored into generated stubs.

Keep in sync with ``colosseum/__init__.py`` ``__all__`` (minus plugin namespaces).
"""

from __future__ import annotations

# Absolute imports so typings/colosseum/__init__.pyi does not shadow submodules.
CORE_EXPORT_LINES: tuple[str, ...] = (
    "from colosseum.decorators import (",
    "    CommandResult,",
    "    VerificationResult,",
    "    command,",
    "    measurement,",
    "    verification,",
    ")",
    "from colosseum.exceptions import ProceduralFault",
    "from colosseum.context import auto_key",
    "from colosseum.results.exit_policy import endex",
    "from colosseum.config.parameters import load_parameter",
    "import colosseum.config as config",
    "import colosseum.database as database",
    "from importlib import metadata as _metadata",
    "try:",
    '    __version__ = _metadata.version("colosseum-core")',
    "except _metadata.PackageNotFoundError:",
    '    __version__ = "0.0.0"',
)
