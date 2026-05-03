# CONVENTIONS.md — Lab Tools 2

Rules that constrain new work. Conventions live or die by being current —
update this file in the phase that produces a new rule, not later.

This file is hand-written (not auto-generated). For "what currently exists
in code", see `CODEBASE_INDEX.md`. For "why we built it this way", see
`ARCHITECTURE.md`.

---

## TypeScript

### Template literals are preferred in TS/TSX
Use template literals freely — `` `Heading ${level}` `` is preferred over
string concatenation. The Python "no f-strings without placeholders" rule
in user preferences applies ONLY to Python; it does NOT extend to
TypeScript template literals by analogy.

**Origin:** Phase 9a-fix (commit `746aa62`). CC initially wrote
`'Heading ' + String(node.attrs.level)` as an over-extension of the Python
rule. Caught in review.

---

## Documentation tense

Architectural docs are tenseless. When migrating content from a phase
plan into `ARCHITECTURE.md`, drop temporal qualifiers like "introduced
in a later phase," "to be added," "now planned." `ARCHITECTURE.md`
describes what is, not what was-or-will-be planned.

**Origin:** docs/restructure phase, commit `fb3fa30`.

---

## Frontend visual conventions

### Right-edge fade masks are always-on
Containers with `overflow-x: auto` that use a right-edge fade mask
(currently `panel-fade-right`) apply the mask unconditionally — the mask
is not gated on actual overflow. Consequence: when a table fits its
container without overflow, the rightmost element fades cosmetically.
This is the accepted tradeoff; do not "fix" by adding overflow detection.

If a specific surface looks wrong with the always-on fade, drop the fade
class from that surface only — keep `scrollbar-hide` independently. Do
NOT add JavaScript-based overflow detection.

**Origin:** Phase 9a-fix (commit `746aa62`).

---

## Python

### No f-strings without placeholders
Use `str()`, `.format()`, or `%` formatting for static strings. This is
a linter-enforced rule from the user's environment.

### One import per line
No `import os, sys`. Each import on its own line.

### No semicolons
No semicolons to combine statements on one line.

### `from __future__ import annotations`
Required at the top of every Python file in this project.

---

## SQLAlchemy / SQLite

### FK pragma in BOTH `database.py` AND `tests/conftest.py`
SQLite silently ignores FK constraints without it. If FK tests pass
without the pragma, the tests are lying.

### `str(uuid.uuid4())` not `uuid.uuid4`
Bare `uuid.uuid4` returns a UUID object, not a string. SQLite `String(36)`
columns will silently store `UUID(...)` repr strings. Add
`assert isinstance(model.id, str)` to model tests.

### Every FK column MUST specify `ondelete`
With FK pragma enabled, missing `ondelete` defaults to RESTRICT, causing
unexpected `IntegrityError` on delete. See `CODEBASE_INDEX.md` for the
current cascade rule per FK.

### Race-condition immunity
All read-then-write operations (e.g. "is this detector already assigned?
if not, assign it") MUST be in a single database transaction. Unique
constraints are the source of truth for conflicts; application-level
checks are for user-friendly error messages only. Always catch
`IntegrityError` and return 409 for conflicts.

---

## FastAPI routing

### No prefix on router files
Prefix is set ONLY in `main.py`'s `include_router` calls. Router files
declare `router = APIRouter()` with no prefix. Endpoints use relative
paths: `@router.get("/")`, `@router.get("/{id}")`.

If routing breaks, FIRST check for accidental `APIRouter(prefix=...)`
in a router file before debugging anywhere else.

---

## Frontend test patterns

### Mock `react-chartjs-2` in vitest
Canvas isn't available in jsdom. Use:
```ts
vi.mock('react-chartjs-2', () => ({
  Line: (props: any) => <canvas data-testid="chart" />
}))
```

### `@/` alias must be configured in three places
`tsconfig.json`, `vite.config.ts`, AND vitest's `resolve.alias` config.
Tests WILL fail on `@/` imports if vitest doesn't resolve the alias.

### Run `tsc --noEmit` from inside `frontend/`
Running it from project root installs the wrong tsc package.

---

## Chart.js

### `animation: false` on ALL chart configs
Without this, spectra charts lag on every data change.

### `pointRadius: 0` on ALL datasets
400 dots on a spectra curve murders performance.

### `chartjs-plugin-annotation` required
Used for laser lines and detector window overlays in panel spectra views.
Must be in `package.json`.

---

## dnd-kit

### `{...listeners}` on handle, `{...attributes}` + `ref` on row
Spreading both on the row breaks keyboard accessibility. The drag handle
`<td>` gets `{...listeners}`. The `<tr>` gets `{...attributes}` and the
`ref={setNodeRef}`.

### Use `CSS.Transform.toString(transform)`
Never build the transform string manually. Always import `CSS` from
`@dnd-kit/utilities`.

---

## TanStack Query

### Mutations invalidate the list key on success
See `CODEBASE_INDEX.md` § "TanStack Query Keys" for current key
conventions. Pattern: `qc.invalidateQueries({ queryKey: ['<entity>'] })`
in `onSuccess`.

### Mid-edit refetches must use `refetchType: 'none'`
Assignment/target mutations on panels invalidate `['panels', panelId]`
with `refetchType: 'none'` to avoid disruptive mid-edit refetches.

### `SET_PANEL` reducer guard
`SET_PANEL` in panel reducers should use a `useRef` guard to fire only on
genuine panel ID change, not on background refetches.

---

## How to add to this file

When CC's report contains "Decisions made under discretion" entries, web
Claude reviews each as a convention candidate. If a decision reflects a
rule that should govern future work, add it here in the same turn —
include `**Origin:**` line citing the phase + commit SHA so the rule has
provenance.
