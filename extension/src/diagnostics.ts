import * as vscode from "vscode";

export interface CatalogNode {
  children?: Record<string, CatalogNode>;
  module?: string;
}

export interface NamespaceCatalog {
  core_names: string[];
  namespaces: Record<string, CatalogNode>;
}

export function findColosseumAliases(source: string): string[] {
  const aliases = new Set<string>();
  const asImport = /^\s*import\s+colosseum\s+as\s+([A-Za-z_]\w*)/gm;
  const plainImport = /^\s*import\s+colosseum\b(?!\s*\.)/gm;
  let match: RegExpExecArray | null;
  while ((match = asImport.exec(source)) !== null) {
    aliases.add(match[1]);
  }
  if (plainImport.test(source)) {
    aliases.add("colosseum");
  }
  return [...aliases];
}

function lineIsCommentOrBlank(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

/** Rough skip when the match sits inside a `#` comment on that line. */
function matchInComment(line: string, matchIndexInLine: number): boolean {
  const hash = line.indexOf("#");
  return hash !== -1 && hash < matchIndexInLine;
}

/** Rough skip for matches inside quotes on the same line (no multi-line strings). */
function matchInQuotes(line: string, matchIndexInLine: number): boolean {
  let inSingle = false;
  let inDouble = false;
  let inTripleSingle = false;
  let inTripleDouble = false;
  for (let i = 0; i < matchIndexInLine; i++) {
    const ch = line[i];
    const next2 = line.slice(i, i + 3);
    if (!inSingle && !inDouble && next2 === '"""') {
      inTripleDouble = !inTripleDouble;
      i += 2;
      continue;
    }
    if (!inSingle && !inDouble && next2 === "'''") {
      inTripleSingle = !inTripleSingle;
      i += 2;
      continue;
    }
    if (inTripleSingle || inTripleDouble) {
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    }
  }
  return inSingle || inDouble || inTripleSingle || inTripleDouble;
}

export interface PathDiagnostic {
  /** Full dotted path after the alias, e.g. equipment.nope */
  path: string;
  /** Segment that failed, e.g. nope */
  badSegment: string;
  /** Index of bad segment within path parts */
  badIndex: number;
  message: string;
  start: number;
  end: number;
}

export function validatePath(
  parts: string[],
  catalog: NamespaceCatalog,
): { ok: true } | { ok: false; badIndex: number; message: string } {
  if (parts.length === 0) {
    return { ok: true };
  }

  const first = parts[0];
  const core = new Set(catalog.core_names);
  const nsNode = catalog.namespaces[first];

  if (core.has(first)) {
    // Core symbols are not walked further by this linter (Pylance owns them).
    return { ok: true };
  }

  if (!nsNode) {
    const known = Object.keys(catalog.namespaces).sort().join(", ") || "(none)";
    return {
      ok: false,
      badIndex: 0,
      message:
        `Unknown Colosseum namespace '${first}'. ` +
        `Installed plugin namespaces: ${known}. ` +
        `Install the plugin package or run Colosseum: Refresh namespace stubs.`,
    };
  }

  let node: CatalogNode = nsNode;
  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i];
    const children = node.children ?? {};
    if (!(segment in children)) {
      const available = Object.keys(children).sort().slice(0, 12);
      const hint =
        available.length > 0
          ? ` Known names: ${available.join(", ")}${Object.keys(children).length > 12 ? ", …" : ""}.`
          : "";
      const prefix = ["col", ...parts.slice(0, i)].join(".");
      return {
        ok: false,
        badIndex: i,
        message: `'${segment}' is not a known attribute of ${prefix}.${hint}`,
      };
    }
    node = children[segment];
  }
  return { ok: true };
}

export function collectPathDiagnostics(
  source: string,
  catalog: NamespaceCatalog,
  aliases: string[],
): PathDiagnostic[] {
  const diagnostics: PathDiagnostic[] = [];
  if (aliases.length === 0) {
    return diagnostics;
  }

  const aliasPattern = aliases.map(escapeRegExp).join("|");
  const re = new RegExp(`\\b(?:${aliasPattern})\\.([A-Za-z_]\\w*(?:\\.[A-Za-z_]\\w*)*)`, "g");

  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const fullStart = match.index;
    const dotted = match[1];
    const parts = dotted.split(".");

    // Locate line for quote/comment checks
    const lineStart = source.lastIndexOf("\n", fullStart) + 1;
    const lineEnd = source.indexOf("\n", fullStart);
    const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
    if (lineIsCommentOrBlank(line)) {
      continue;
    }
    const indexInLine = fullStart - lineStart;
    if (matchInComment(line, indexInLine) || matchInQuotes(line, indexInLine)) {
      continue;
    }

    const result = validatePath(parts, catalog);
    if (result.ok) {
      continue;
    }

    // Highlight only the bad segment within the match.
    const aliasAndDotLength = match[0].length - dotted.length;
    let segStart = fullStart + aliasAndDotLength;
    for (let i = 0; i < result.badIndex; i++) {
      segStart += parts[i].length + 1;
    }
    const segEnd = segStart + parts[result.badIndex].length;

    diagnostics.push({
      path: dotted,
      badSegment: parts[result.badIndex],
      badIndex: result.badIndex,
      message: result.message,
      start: segStart,
      end: segEnd,
    });
  }

  return diagnostics;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function offsetToPosition(source: string, offset: number): vscode.Position {
  let line = 0;
  let lastNl = -1;
  for (let i = 0; i < offset; i++) {
    if (source[i] === "\n") {
      line++;
      lastNl = i;
    }
  }
  return new vscode.Position(line, offset - (lastNl + 1));
}

export function applyCatalogDiagnostics(
  collection: vscode.DiagnosticCollection,
  doc: vscode.TextDocument,
  catalog: NamespaceCatalog | undefined,
): void {
  if (doc.languageId !== "python") {
    return;
  }
  if (!catalog) {
    collection.delete(doc.uri);
    return;
  }

  const enabled = vscode.workspace
    .getConfiguration("colosseumLinter")
    .get<boolean>("enableDiagnostics", true);
  if (!enabled) {
    collection.delete(doc.uri);
    return;
  }

  const source = doc.getText();
  const aliases = findColosseumAliases(source);
  const findings = collectPathDiagnostics(source, catalog, aliases);
  const severitySetting = vscode.workspace
    .getConfiguration("colosseumLinter")
    .get<string>("diagnosticSeverity", "Warning");
  const severity =
    severitySetting === "Error"
      ? vscode.DiagnosticSeverity.Error
      : severitySetting === "Information"
        ? vscode.DiagnosticSeverity.Information
        : severitySetting === "Hint"
          ? vscode.DiagnosticSeverity.Hint
          : vscode.DiagnosticSeverity.Warning;

  const diags = findings.map((f) => {
    const range = new vscode.Range(
      offsetToPosition(source, f.start),
      offsetToPosition(source, f.end),
    );
    const diag = new vscode.Diagnostic(range, f.message, severity);
    diag.source = "colosseum-linter";
    diag.code = f.badIndex === 0 ? "unknown-namespace" : "unknown-attribute";
    return diag;
  });
  collection.set(doc.uri, diags);
}
