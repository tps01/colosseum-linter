import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import {
  NamespaceCatalog,
  applyCatalogDiagnostics,
} from "./diagnostics";

const REFRESH_COMMAND = "colosseumLinter.refreshStubs";

interface GeneratorSummary {
  stub_path: string;
  catalog_path?: string;
  namespaces: Record<string, string>;
  catalog?: NamespaceCatalog;
  warnings: string[];
}

let statusBarItem: vscode.StatusBarItem;
let diagnosticCollection: vscode.DiagnosticCollection;
let currentCatalog: NamespaceCatalog | undefined;
let changeTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
  diagnosticCollection = vscode.languages.createDiagnosticCollection("colosseum-linter");
  context.subscriptions.push(diagnosticCollection);

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = REFRESH_COMMAND;
  statusBarItem.tooltip = "Refresh Colosseum namespace stubs";
  statusBarItem.text = "$(sync) Colosseum stubs";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand(REFRESH_COMMAND, () => refreshStubs(context)),
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      applyCatalogDiagnostics(diagnosticCollection, doc, currentCatalog);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId !== "python") {
        return;
      }
      if (changeTimer) {
        clearTimeout(changeTimer);
      }
      changeTimer = setTimeout(() => {
        applyCatalogDiagnostics(
          diagnosticCollection,
          event.document,
          currentCatalog,
        );
      }, 400);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      diagnosticCollection.delete(doc.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("colosseumLinter.enableDiagnostics") ||
        event.affectsConfiguration("colosseumLinter.diagnosticSeverity")
      ) {
        refreshOpenDocumentDiagnostics();
      }
    }),
  );

  const pythonExt = vscode.extensions.getExtension("ms-python.python");
  if (pythonExt) {
    void pythonExt.activate().then((api: PythonExtensionApi | undefined) => {
      const environments = api?.environments;
      if (environments?.onDidChangeActiveEnvironmentPath) {
        context.subscriptions.push(
          environments.onDidChangeActiveEnvironmentPath(() => {
            void refreshStubs(context);
          }),
        );
      }
    });
  }

  const autoRefresh = vscode.workspace
    .getConfiguration("colosseumLinter")
    .get<boolean>("autoRefreshOnActivate", true);
  if (autoRefresh) {
    void refreshStubs(context);
  } else {
    loadCatalogFromWorkspace();
    refreshOpenDocumentDiagnostics();
  }
}

export function deactivate(): void {
  if (changeTimer) {
    clearTimeout(changeTimer);
  }
}

interface PythonExtensionApi {
  environments?: {
    getActiveEnvironmentPath?: (resource?: vscode.Uri) => { path: string } | undefined;
    resolveEnvironment?: (
      path: string | { path: string },
    ) => Thenable<{ executable?: { uri?: vscode.Uri } } | undefined>;
    onDidChangeActiveEnvironmentPath?: (
      listener: () => void,
    ) => vscode.Disposable;
  };
}

async function resolvePythonInterpreter(): Promise<string | undefined> {
  const pythonExt = vscode.extensions.getExtension("ms-python.python");
  if (pythonExt) {
    try {
      const api = (await pythonExt.activate()) as PythonExtensionApi;
      const folder = vscode.workspace.workspaceFolders?.[0];
      const envPath = api.environments?.getActiveEnvironmentPath?.(folder?.uri);
      if (envPath?.path) {
        const resolved = await api.environments?.resolveEnvironment?.(envPath);
        const execUri = resolved?.executable?.uri;
        if (execUri) {
          return execUri.fsPath;
        }
        return envPath.path;
      }
    } catch {
      // fall through
    }
  }

  const configPath = vscode.workspace
    .getConfiguration("python")
    .get<string>("defaultInterpreterPath");
  if (configPath && configPath !== "python") {
    return configPath;
  }
  return "python";
}

function pythonPackageRoot(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, "python");
}

function stubOutDir(folder: vscode.WorkspaceFolder): string {
  const stubRel = vscode.workspace
    .getConfiguration("colosseumLinter")
    .get<string>("stubPath", "typings");
  return path.isAbsolute(stubRel)
    ? stubRel
    : path.join(folder.uri.fsPath, stubRel);
}

function loadCatalogFromWorkspace(): void {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }
  const catalogPath = path.join(stubOutDir(folder), "colosseum_namespaces.json");
  try {
    if (fs.existsSync(catalogPath)) {
      currentCatalog = JSON.parse(
        fs.readFileSync(catalogPath, "utf8"),
      ) as NamespaceCatalog;
    }
  } catch (err) {
    console.warn("[colosseum-linter] Failed to load catalog:", err);
  }
}

function refreshOpenDocumentDiagnostics(): void {
  for (const doc of vscode.workspace.textDocuments) {
    applyCatalogDiagnostics(diagnosticCollection, doc, currentCatalog);
  }
}

async function refreshStubs(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    statusBarItem.text = "$(warning) Colosseum stubs";
    statusBarItem.tooltip = "Open a workspace folder to generate stubs";
    void vscode.window.showWarningMessage(
      "Colosseum stubs: open a workspace folder first.",
    );
    return;
  }

  const outDir = stubOutDir(folder);
  const python = await resolvePythonInterpreter();
  if (!python) {
    statusBarItem.text = "$(error) Colosseum stubs";
    void vscode.window.showErrorMessage(
      "Colosseum stubs: could not resolve a Python interpreter.",
    );
    return;
  }

  statusBarItem.text = "$(sync~spin) Colosseum stubs";

  try {
    const summary = await runGenerator(python, pythonPackageRoot(context), outDir);
    currentCatalog = summary.catalog;
    if (!currentCatalog) {
      loadCatalogFromWorkspace();
    }
    refreshOpenDocumentDiagnostics();

    const names = Object.keys(summary.namespaces).sort();
    if (names.length === 0) {
      statusBarItem.text = "$(info) Colosseum stubs: none";
      statusBarItem.tooltip =
        "No colosseum.plugins namespaces found. Install plugins in the selected venv.";
    } else {
      statusBarItem.text = `$(check) Colosseum stubs: ${names.length}`;
      statusBarItem.tooltip = `Namespaces: ${names.join(", ")}\n${summary.stub_path}`;
    }
    for (const warning of summary.warnings) {
      console.warn(`[colosseum-linter] ${warning}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    statusBarItem.text = "$(error) Colosseum stubs";
    statusBarItem.tooltip = message;
    void vscode.window.showErrorMessage(`Colosseum stubs failed: ${message}`);
  }
}

function runGenerator(
  python: string,
  packageRoot: string,
  outDir: string,
): Promise<GeneratorSummary> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      ["-m", "colosseum_linter", "--out", outDir, "--json"],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          PYTHONPATH: packageRoot + path.delimiter + (process.env.PYTHONPATH ?? ""),
        },
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() || stdout.trim() || `generator exited with code ${code}`,
          ),
        );
        return;
      }
      try {
        const summary = JSON.parse(stdout.trim()) as GeneratorSummary;
        resolve(summary);
      } catch {
        reject(
          new Error(
            `Could not parse generator output: ${stdout.trim() || stderr.trim()}`,
          ),
        );
      }
    });
  });
}
