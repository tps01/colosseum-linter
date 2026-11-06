# Colosseum Linter (local Cursor / VS Code extension)

For **test-script authors**: generate Pylance stubs so `import colosseum as col` resolves plugin paths like `col.equipment.vsg.set_frequency()` with completions, signatures, and Ctrl+Click. The extension also **lints** unknown namespaces and attributes (for example `col.equipment.nope` or `col.missing_plugin`).

Works with any installed package that follows Colosseum plugin conventions (`colosseum.plugins` entry point + `register_namespace`), including third-party plugins.

This project is **not published** to a marketplace by default. Install from a local or GitHub release `.vsix` (or F5 while developing).

## Install / smoke checklist

1. Install the `.vsix` (Extensions → Install from VSIX, or a [GitHub Release](https://github.com/tps01/colosseum-linter/releases) asset).
2. Open a test-script workspace and select the Python interpreter that has `colosseum-core` + plugins installed (status bar **Colosseum interpreter**, or **Colosseum: Select interpreter** / **Python: Select Interpreter**).
3. Run **Colosseum: Refresh namespace stubs** (or rely on auto-refresh on activate; switching interpreter also refreshes).
4. In a script with `import colosseum as col`, confirm completion / Ctrl+Click on something like `col.equipment.vsg.set_frequency`.
5. Confirm a squiggle on a deliberate bad path such as `col.equipment.nope` or `col.not_a_plugin`.
6. Hover a decorated API such as `col.equipment.psu.set_output` — expect real keyword params and the Sphinx docstring, not `(function) …: Any`.

## Workshop workspace (this monorepo)

When the Cursor workspace root is `workshop/` (parent of `colosseum/`), pin the interpreter to the Colosseum venv so stub refresh discovers plugins:

```json
// workshop/.vscode/settings.json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/colosseum/.venv/Scripts/python.exe"
}
```

Then click **Colosseum interpreter** on the status bar (or **Python: Select Interpreter**) → `colosseum\.venv`. Status bar should show `Colosseum stubs: N` with `N > 0` (for example `equipment`, `shared`, …).

If discovery returns no namespaces, the extension **keeps the previous** stubs/catalog on disk and warns with the resolved Python path — so a PATH Python without plugins cannot wipe a good catalog.

## How it works

1. Uses the **selected Python interpreter** (venv where your Colosseum plugins are installed).
2. Discovers `colosseum.plugins` entry points and calls each `register(...)`.
3. Writes `typings/colosseum/__init__.pyi` that **aliases** each namespace to its real plugin API module (for example `import colosseum_equipment.api as equipment`). Hover and Ctrl+Click therefore follow into installed source — signatures/docstrings come from those modules (and their typed decorators), not from a generated nested `.pyi` tree.
4. Writes `typings/colosseum_namespaces.json` (attribute catalog) used for unknown-path diagnostics.
5. Pylance reads `typings/` by default (`python.analysis.stubPath`); the extension overlays Colosseum-specific warnings.

You do **not** need to `pip install` this linter into the venv; the extension ships the Python generator and runs it with your interpreter.

## Prerequisites

- Cursor or VS Code
- Node.js 18+ (to build the extension)
- A workspace with a Python interpreter that has `colosseum-core` and any plugins you use (`pip install` / editable installs). For the workshop root, use `colosseum/.venv` as above.

## Develop (F5)

```powershell
cd colosseum\colosseum-linter\extension
npm install
npm run compile
```

Open the `colosseum-linter` folder in Cursor, then **Run and Debug → Run Extension** (F5). An Extension Development Host window opens with the extension loaded.

In that window, open a test-script workspace whose interpreter has plugins installed. Stubs regenerate on activate and when the interpreter changes. You can also run:

**Command Palette → `Colosseum: Refresh namespace stubs`**

## Build a `.vsix`

```powershell
cd colosseum\colosseum-linter
.\scripts\build.ps1
```

On Linux/macOS / CI: `bash scripts/build.sh`.

Or manually:

```powershell
cd colosseum\colosseum-linter\extension
npm install
npm run compile
npm run package
```

In Cursor: Extensions → `...` → **Install from VSIX...** → select the generated `.vsix`.

Or:

```powershell
cursor --install-extension .\colosseum-linter-1.1.0.vsix
```

## After installing a new plugin

```powershell
pip install my-colosseum-plugin
```

Then run **Colosseum: Refresh namespace stubs** (or switch the Python interpreter to trigger a refresh).

## CLI (without the extension)

```powershell
cd colosseum\colosseum-linter\extension\python
python -m colosseum_linter --out path\to\workspace\typings --json
```

Use the same interpreter that has your plugins installed.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `colosseumLinter.stubPath` | `typings` | Workspace-relative (or absolute) stub output directory |
| `colosseumLinter.autoRefreshOnActivate` | `true` | Regenerate stubs when the extension activates |
| `colosseumLinter.enableDiagnostics` | `true` | Warn on unknown `col.<namespace>` / attributes |
| `colosseumLinter.diagnosticSeverity` | `Warning` | `Error` / `Warning` / `Information` / `Hint` |

## Tests

```powershell
cd colosseum\colosseum-linter
python -m pytest -q
```

## Layout

```
colosseum-linter/
  extension/           # VS Code / Cursor extension
    src/extension.ts
    python/colosseum_linter/   # stub generator shipped inside the VSIX
  tests/               # pytest for discover/generate
```
