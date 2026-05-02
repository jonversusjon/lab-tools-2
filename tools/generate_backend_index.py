#!/usr/bin/env python3
"""
generate_backend_index.py — Auto-generate the backend slice of CODEBASE_INDEX.md.

Walks models.py, schemas.py, all router files, and main.py to extract
deterministic facts about the backend. Pure stdlib, no LLM in the loop.

Usage:
    python tools/generate_backend_index.py \
        --models backend/models.py \
        --schemas backend/schemas.py \
        --main backend/main.py \
        --routers-dir backend/routers \
        --out CODEBASE_INDEX.backend.md

    python tools/generate_backend_index.py [...] --check
        Exit non-zero if regeneration would change the file.
"""

from __future__ import annotations

import argparse
import ast
import subprocess
import sys
from datetime import datetime
from datetime import timezone
from pathlib import Path


# ---------- AST helpers ----------

def _unparse(node):
    if node is None:
        return ""
    try:
        return ast.unparse(node)
    except Exception:
        return "<unparse-failed>"


def _extends(node: ast.ClassDef, base_name: str) -> bool:
    for b in node.bases:
        if isinstance(b, ast.Name) and b.id == base_name:
            return True
        if isinstance(b, ast.Attribute) and b.attr == base_name:
            return True
        if (
            isinstance(b, ast.Subscript)
            and isinstance(b.value, ast.Name)
            and b.value.id == base_name
        ):
            return True
    return False


# ---------- Models extraction ----------

def extract_models(path: Path) -> list[dict]:
    tree = ast.parse(path.read_text())
    models = []
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        if not _extends(node, "Base"):
            continue
        m = {
            "name": node.name,
            "tablename": None,
            "columns": [],
            "table_args": [],
            "relationships": [],
        }
        for stmt in node.body:
            if isinstance(stmt, ast.Assign):
                for tgt in stmt.targets:
                    if isinstance(tgt, ast.Name):
                        if tgt.id == "__tablename__" and isinstance(stmt.value, ast.Constant):
                            m["tablename"] = stmt.value.value
                        elif tgt.id == "__table_args__" and isinstance(stmt.value, ast.Tuple):
                            for elt in stmt.value.elts:
                                m["table_args"].append(_unparse(elt))
                if (
                    len(stmt.targets) == 1
                    and isinstance(stmt.targets[0], ast.Name)
                    and isinstance(stmt.value, ast.Call)
                ):
                    cname = stmt.targets[0].id
                    fn = stmt.value.func
                    fname = fn.id if isinstance(fn, ast.Name) else getattr(fn, "attr", "")
                    if fname == "Column":
                        m["columns"].append(_extract_column(cname, stmt.value))
                    elif fname == "relationship":
                        m["relationships"].append(_extract_relationship(cname, stmt.value))
        if m["tablename"]:
            models.append(m)
    return models


def _extract_column(name: str, call: ast.Call) -> dict:
    col = {
        "name": name, "type": "", "nullable": True, "default": None,
        "fk_target": None, "fk_ondelete": None, "primary_key": False, "unique": False,
    }
    type_idx = -1
    for i, arg in enumerate(call.args):
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str) and i == 0:
            continue
        if type_idx == -1:
            col["type"] = _unparse(arg)
            type_idx = i
            continue
        if isinstance(arg, ast.Call):
            f = arg.func
            fname = f.id if isinstance(f, ast.Name) else getattr(f, "attr", "")
            if fname == "ForeignKey":
                if arg.args and isinstance(arg.args[0], ast.Constant):
                    col["fk_target"] = arg.args[0].value
                for kw in arg.keywords:
                    if kw.arg == "ondelete" and isinstance(kw.value, ast.Constant):
                        col["fk_ondelete"] = kw.value.value
    for kw in call.keywords:
        if kw.arg == "nullable" and isinstance(kw.value, ast.Constant):
            col["nullable"] = kw.value.value
        elif kw.arg == "primary_key" and isinstance(kw.value, ast.Constant):
            col["primary_key"] = kw.value.value
        elif kw.arg == "unique" and isinstance(kw.value, ast.Constant):
            col["unique"] = kw.value.value
        elif kw.arg == "default":
            col["default"] = _unparse(kw.value)
    return col


def _extract_relationship(name: str, call: ast.Call) -> dict:
    rel = {"name": name, "target": None, "back_populates": None, "cascade": None}
    if call.args and isinstance(call.args[0], ast.Constant):
        rel["target"] = call.args[0].value
    for kw in call.keywords:
        if kw.arg == "back_populates" and isinstance(kw.value, ast.Constant):
            rel["back_populates"] = kw.value.value
        elif kw.arg == "cascade" and isinstance(kw.value, ast.Constant):
            rel["cascade"] = kw.value.value
    return rel


# ---------- Schemas extraction ----------

def extract_schemas(path: Path) -> list[dict]:
    tree = ast.parse(path.read_text())
    schemas = []
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        if not _extends(node, "BaseModel"):
            continue
        sch = {
            "name": node.name,
            "fields": [],
            "parents": [_unparse(b) for b in node.bases if not (isinstance(b, ast.Name) and b.id == "BaseModel")],
        }
        for stmt in node.body:
            if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                sch["fields"].append({
                    "name": stmt.target.id,
                    "type": _unparse(stmt.annotation),
                    "default": _unparse(stmt.value) if stmt.value else None,
                })
        schemas.append(sch)
    return schemas


# ---------- Routes extraction ----------

def extract_prefixes(main_file: Path) -> dict[str, str]:
    tree = ast.parse(main_file.read_text())
    prefixes = {}
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "include_router"
            and node.args
        ):
            arg = node.args[0]
            if isinstance(arg, ast.Attribute) and isinstance(arg.value, ast.Name):
                module = arg.value.id
                prefix = ""
                for kw in node.keywords:
                    if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
                        prefix = kw.value.value
                prefixes[module] = prefix
    return prefixes


def extract_routes(routers_dir: Path, main_file: Path) -> list[dict]:
    prefixes = extract_prefixes(main_file)
    routes = []
    for py_file in sorted(routers_dir.glob("*.py")):
        if py_file.name.startswith("_"):
            continue
        module = py_file.stem
        prefix = prefixes.get(module, "")
        tree = ast.parse(py_file.read_text())
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for dec in node.decorator_list:
                    r = _extract_route(dec, node, prefix, module)
                    if r:
                        routes.append(r)
    return routes


def _extract_route(dec, fn, prefix: str, module: str):
    if not isinstance(dec, ast.Call):
        return None
    if not isinstance(dec.func, ast.Attribute):
        return None
    if not (isinstance(dec.func.value, ast.Name) and dec.func.value.id == "router"):
        return None
    verb = dec.func.attr.upper()
    if verb not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
        return None
    suffix = ""
    if dec.args and isinstance(dec.args[0], ast.Constant):
        suffix = dec.args[0].value
    response_model = None
    status_code = None
    for kw in dec.keywords:
        if kw.arg == "response_model":
            response_model = _unparse(kw.value)
        elif kw.arg == "status_code" and isinstance(kw.value, ast.Constant):
            status_code = kw.value.value
    full = (prefix.rstrip("/") + "/" + suffix.lstrip("/")).rstrip("/") or "/"
    return {
        "verb": verb, "path": full, "function": fn.name, "module": module,
        "response_model": response_model, "status_code": status_code,
    }


# ---------- Markdown rendering ----------

def render(models, schemas, routes, commit_sha):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    L = []
    L.append("<!-- AUTO-GENERATED. Do not edit. Regenerate via `make index`. -->")
    L.append("# Codebase Index — Backend")
    L.append("")
    L.append("Generated: " + now)
    L.append("Commit: " + (commit_sha or "<unknown>"))
    L.append("")
    L.append("---")
    L.append("")
    L.append("## Backend Models")
    L.append("")
    for m in models:
        L.append("### `" + m["name"] + "` → table `" + m["tablename"] + "`")
        L.append("")
        L.append("| Column | Type | Null | PK | Uniq | FK | ondelete | Default |")
        L.append("|---|---|---|---|---|---|---|---|")
        for c in m["columns"]:
            row = [
                "`" + c["name"] + "`",
                "`" + c["type"] + "`",
                "✓" if (c["nullable"] and not c["primary_key"]) else "",
                "✓" if c["primary_key"] else "",
                "✓" if c["unique"] else "",
                ("`" + c["fk_target"] + "`") if c["fk_target"] else "",
                ("`" + c["fk_ondelete"] + "`") if c["fk_ondelete"] else "",
                ("`" + c["default"] + "`") if c["default"] else "",
            ]
            L.append("| " + " | ".join(row) + " |")
        if m["table_args"]:
            L.append("")
            L.append("**Table args:**")
            for ta in m["table_args"]:
                L.append("- `" + ta + "`")
        if m["relationships"]:
            L.append("")
            L.append("**Relationships:**")
            for r in m["relationships"]:
                bp = (" back_populates=" + r["back_populates"]) if r["back_populates"] else ""
                cs = (" cascade=" + r["cascade"]) if r["cascade"] else ""
                L.append("- `" + r["name"] + "` → " + str(r["target"]) + bp + cs)
        L.append("")

    L.append("## Resolved API Routes")
    L.append("")
    L.append("| Verb | Path | Handler | Response model | Status |")
    L.append("|---|---|---|---|---|")
    for r in sorted(routes, key=lambda x: (x["path"], x["verb"])):
        row = [
            "`" + r["verb"] + "`",
            "`" + r["path"] + "`",
            "`" + r["module"] + "." + r["function"] + "`",
            "`" + (r["response_model"] or "") + "`",
            str(r["status_code"]) if r["status_code"] else "",
        ]
        L.append("| " + " | ".join(row) + " |")
    L.append("")

    L.append("## Pydantic Schemas")
    L.append("")
    for s in schemas:
        parents = ", ".join(s["parents"])
        suffix = (" : " + parents) if parents else ""
        L.append("### `" + s["name"] + "`" + suffix)
        L.append("")
        if s["fields"]:
            L.append("| Field | Type | Default |")
            L.append("|---|---|---|")
            for f in s["fields"]:
                L.append(
                    "| `" + f["name"] + "` | `" + f["type"] + "` | "
                    + (("`" + f["default"] + "`") if f["default"] else "") + " |"
                )
        L.append("")

    return "\n".join(L) + "\n"


def _git_sha():
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _strip_timestamp(s: str) -> str:
    return "\n".join(l for l in s.splitlines() if not l.startswith("Generated:"))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--models", default="backend/models.py")
    p.add_argument("--schemas", default="backend/schemas.py")
    p.add_argument("--main", default="backend/main.py")
    p.add_argument("--routers-dir", default="backend/routers")
    p.add_argument("--out", default="CODEBASE_INDEX.backend.md")
    p.add_argument("--check", action="store_true",
                   help="Exit non-zero if regeneration would change the output file")
    args = p.parse_args()

    models = extract_models(Path(args.models))
    schemas = extract_schemas(Path(args.schemas))
    routes = extract_routes(Path(args.routers_dir), Path(args.main))
    out = render(models, schemas, routes, _git_sha())
    out_path = Path(args.out)

    if args.check:
        existing = out_path.read_text() if out_path.exists() else ""
        if _strip_timestamp(existing) != _strip_timestamp(out):
            sys.stderr.write(str(out_path) + " is stale. Run `make index`.\n")
            return 1
        return 0

    out_path.write_text(out)
    sys.stdout.write("Wrote " + str(out_path) + " (" + str(len(out)) + " bytes)\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
