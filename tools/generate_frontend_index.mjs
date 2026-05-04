#!/usr/bin/env node
/**
 * generate_frontend_index.mjs — Auto-generate the frontend slice of the index.
 *
 * Walks the frontend TS/TSX source via ts-morph and extracts:
 *   - Exported hooks (functions whose name starts with "use")
 *   - Exported components (default-exported functions in .tsx files)
 *   - TanStack Query keys (textual extraction — fragile but useful)
 *
 * Usage:
 *   node tools/generate_frontend_index.mjs \
 *     --tsconfig frontend/tsconfig.json \
 *     --root frontend/src \
 *     --out CODEBASE_INDEX.frontend.md
 *
 *   node tools/generate_frontend_index.mjs [...] --check
 *     Exit non-zero if regeneration would change the file.
 */

import { Project, SyntaxKind } from "ts-morph";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    tsconfig: { type: "string", default: "frontend/tsconfig.json" },
    root: { type: "string", default: "frontend/src" },
    out: { type: "string", default: "CODEBASE_INDEX.frontend.md" },
    check: { type: "boolean", default: false },
  },
});

const project = new Project({ tsConfigFilePath: args.tsconfig, skipAddingFilesFromTsConfig: false });

const ROOT = path.resolve(args.root);
const hooks = [];
const components = [];
const queryKeys = [];

function rel(p) {
  return path.relative(process.cwd(), p);
}

function shortType(t) {
  // Keep type strings readable — collapse anything > 120 chars.
  const s = t.getText();
  if (s.length > 120) return s.slice(0, 117) + "...";
  return s;
}

for (const sf of project.getSourceFiles()) {
  const fp = sf.getFilePath();
  if (!fp.startsWith(ROOT)) continue;
  if (fp.includes("/node_modules/")) continue;
  if (/\.(test|spec)\.tsx?$/.test(fp)) continue;
  if (fp.endsWith(".d.ts")) continue;

  const file = rel(fp);

  // Hooks: function declarations starting with "use"
  for (const fn of sf.getFunctions()) {
    if (!fn.isExported()) continue;
    const name = fn.getName();
    if (!name || !name.startsWith("use")) continue;
    const params = fn.getParameters().map(p => p.getText()).join(", ");
    let returnType = "";
    try { returnType = shortType(fn.getReturnType()); } catch { returnType = ""; }
    hooks.push({ name, file, params, returnType });
  }

  // Hooks: exported const useFoo = (...) => ...
  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) continue;
    for (const decl of stmt.getDeclarations()) {
      const name = decl.getName();
      if (!name || !name.startsWith("use")) continue;
      const init = decl.getInitializer();
      if (!init) continue;
      if (init.getKind() !== SyntaxKind.ArrowFunction
          && init.getKind() !== SyntaxKind.FunctionExpression) continue;
      const sig = decl.getType().getCallSignatures()[0];
      const params = sig
        ? sig.getParameters().map(p => p.getName() + ": " + shortType(p.getDeclaredType())).join(", ")
        : "";
      const returnType = sig ? shortType(sig.getReturnType()) : "";
      hooks.push({ name, file, params, returnType });
    }
  }

  // Components: default exports in .tsx files
  if (fp.endsWith(".tsx")) {
    const def = sf.getDefaultExportSymbol();
    if (def) {
      const decls = def.getDeclarations();
      for (const d of decls) {
        if (d.getKind() === SyntaxKind.FunctionDeclaration
            || d.getKind() === SyntaxKind.ArrowFunction
            || d.getKind() === SyntaxKind.FunctionExpression) {
          const name = (d.getName && d.getName()) || path.basename(fp, ".tsx");
          let propsType = "";
          try {
            const params = d.getParameters ? d.getParameters() : [];
            if (params[0]) propsType = shortType(params[0].getType());
          } catch { /* ignore */ }
          components.push({ name, file, propsType });
        }
      }
    }
  }

  // Query keys — textual scan. Catches `queryKey: ['x', y]` and `['x', y]` near useQuery.
  const text = sf.getFullText();
  const re = /queryKey\s*:\s*(\[[^\]]+\])/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    queryKeys.push({ key: m[1].replace(/\s+/g, " ").trim(), file });
  }
}

function gitSha() {
  try { return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); }
  catch { return null; }
}

function render() {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const sha = gitSha() || "<unknown>";
  const L = [];
  L.push("<!-- AUTO-GENERATED. Do not edit. Regenerate via `make index`. -->");
  L.push("# Codebase Index — Frontend");
  L.push("");
  L.push("Generated: " + now);
  L.push("Commit: " + sha);
  L.push("");
  L.push("---");
  L.push("");
  L.push("## Exported Hooks");
  L.push("");
  L.push("| Hook | Params | Returns | File |");
  L.push("|---|---|---|---|");
  for (const h of hooks.sort((a, b) => a.name.localeCompare(b.name))) {
    L.push("| `" + h.name + "` | `" + (h.params || "") + "` | `" + (h.returnType || "") + "` | `" + h.file + "` |");
  }
  L.push("");
  L.push("## Default-Exported Components");
  L.push("");
  L.push("| Component | Props | File |");
  L.push("|---|---|---|");
  for (const c of components.sort((a, b) => a.name.localeCompare(b.name))) {
    L.push("| `" + c.name + "` | `" + (c.propsType || "") + "` | `" + c.file + "` |");
  }
  L.push("");
  L.push("## TanStack Query Keys");
  L.push("");
  // Dedupe by (key, file)
  const seen = new Set();
  const dedup = [];
  for (const q of queryKeys) {
    const sig = q.key + "|" + q.file;
    if (seen.has(sig)) continue;
    seen.add(sig);
    dedup.push(q);
  }
  L.push("| Key | File |");
  L.push("|---|---|");
  for (const q of dedup.sort((a, b) => a.key.localeCompare(b.key))) {
    L.push("| `" + q.key + "` | `" + q.file + "` |");
  }
  L.push("");
  return L.join("\n") + "\n";
}

function stripVolatileHeaders(s) {
  // Strip header lines that change between identical regenerations.
  // `Generated:` changes on every run (timestamp). `Commit:` changes on
  // any new commit, even doc-only commits where the pre-commit hook
  // correctly skipped index regeneration. Both stay in the rendered
  // file — they just don't participate in the --check equivalence check.
  const skipPrefixes = ["Generated:", "Commit:"];
  return s.split("\n")
    .filter(l => !skipPrefixes.some(p => l.startsWith(p)))
    .join("\n");
}

const out = render();
const outPath = path.resolve(args.out);

if (args.check) {
  const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
  if (stripVolatileHeaders(existing) !== stripVolatileHeaders(out)) {
    process.stderr.write(outPath + " is stale. Run `make index`.\n");
    process.exit(1);
  }
  process.exit(0);
}

fs.writeFileSync(outPath, out);
process.stdout.write("Wrote " + outPath + " (" + Buffer.byteLength(out) + " bytes)\n");
