# Colosseum Linter

Cursor / VS Code extension for **Colosseum test-script authors**. It inspects the selected Python environment for installed `colosseum.plugins` packages (first-party or third-party) and generates Pylance stubs so paths like `col.equipment.vsg.set_frequency()` get completions, signatures, hover docs, and Ctrl+Click into real plugin source.

It also ships a lightweight linter: after stubs refresh, unknown namespaces and attributes (for example `col.missing_plugin` or `col.equipment.nope`) are flagged in the editor. Run **Colosseum: Refresh namespace stubs** after installing or removing plugins in the active venv.

Install from a local or release `.vsix` (Extensions → Install from VSIX). Marketplace publishing is optional; this extension is designed to work offline from a GitHub release asset.
