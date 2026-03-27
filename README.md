# Flow Panel Designer — Phased Build Prompts

## How to use

Each phase is a self-contained Claude Code prompt. Run them in order. Each phase has explicit success criteria — verify ALL pass before moving to the next.

### Pre-flight setup

1. **Generate seed spectra (optional but recommended):** Run `python resources/fetch_seed_spectra.py` locally to get real FPbase spectra. This requires network access to fpbase.org which Claude Code does not have. If you skip this, the app ships with Gaussian approximation spectra that work fine for development — real spectra can be fetched per-dye at runtime via the FPbase integration.

2. **Place these files in your project root before Phase 1:**
   - `CLAUDE.md` — Claude Code reads this automatically for conventions
   - `ARCHITECTURE.md` — copy from `PHASE-0-CONTEXT.md` (Phase 1 also does this)
   - `FRONTEND-CONVENTIONS.md` — frontend patterns and testing conventions
   - `resources/fluorophores.json` — pre-populated seed data
   - `resources/fetch_seed_spectra.py` — for local use

### Workflow per phase

1. **Start a Claude Code session**
2. **Paste the phase prompt** (e.g., contents of `PHASE-1-SCAFFOLD.md`)
3. **Let Claude Code work** (~10–20 min per phase)
4. **Run the listed tests** and manual checks
5. **Fix any failures** interactively with Claude Code
6. **Confirm all success criteria pass**
7. **Move to next phase**

### File inventory

| File | Purpose | When to use |
|---|---|---|
| `PHASE-0-CONTEXT.md` | Master architecture doc | Copy into project as `ARCHITECTURE.md` during Phase 1. Claude Code should read this for context in every phase. |
| `CLAUDE.md` | Claude Code conventions, rules, NEVER FORGET checklist | Place in project root before Phase 1. Claude Code reads it automatically. |
| `FRONTEND-CONVENTIONS.md` | Frontend patterns, testing, Chart.js, pagination, state management | Place in project root before Phase 1. Reference from any frontend phase. |
| `PHASE-1-SCAFFOLD.md` | Project structure + empty stubs | First session |
| `PHASE-2-BACKEND-CORE.md` | Database, models, seed data, all CRUD endpoints, backend tests | Second session |
| `PHASE-3-INSTRUMENTS-UI.md` | Instrument manager frontend + layout shell | Third session |
| `PHASE-4-FLUOROPHORES-SPECTRA.md` | Fluorophore table, FPbase fetch, batch-spectra, SpectraViewer (Chart.js) | Fourth session |
| `PHASE-5-ANTIBODIES-UI.md` | Antibody inventory CRUD, pre-conjugated support, Modal component | Fifth session |
| `PHASE-6-PANELS-BASIC.md` | Panel list, designer skeleton, PanelTarget management, column headers | Sixth session |
| `PHASE-7-ASSIGNMENT-GRID.md` | Interactive cells, fluorophore picker, compatibility logic, 1:1 enforcement | Seventh session |
| `PHASE-8-SPILLOVER.md` | Spillover matrix calculation + heatmap + spectra in panel context | Eighth session |
| `PHASE-9-UNDO-POLISH.md` | Undo/redo, UX polish, integration tests, README | Ninth session |
| `resources/fluorophores.json` | Pre-populated seed fluorophore data (~48 entries) | Copied into `backend/seed_data/` during Phase 1 |
| `resources/fetch_seed_spectra.py` | Script to fetch real FPbase spectra locally | Run locally before Phase 1 (optional) |

### Key design decisions

- **Chart.js** (canvas) with **chartjs-plugin-annotation** instead of Recharts (SVG) for all spectra charts — handles dense data without lag
- **1:1 detector:antibody mapping** — each detector gets one antibody, each antibody gets one detector per panel
- **Pre-conjugated antibodies** lock their fluorophore in the panel designer; unconjugated let users pick
- **SQLite FK pragma** enabled everywhere — without it, FK constraints are silently ignored
- **FPbase integration** works at runtime but is not available during Claude Code builds — seed data is pre-populated
- **Undo/redo** stores full assignment payloads, not just IDs, to handle backend re-POST ID changes
- **PanelTarget model** persists target rows independently of assignments — targets survive page reloads and instrument changes
- **Nullable instrument_id** on Panel — panels survive instrument deletion (SET NULL, not CASCADE)
- **Batch spectra endpoint** (`POST /fluorophores/batch-spectra`) — one call loads all spectra for the panel designer, avoiding N+1 fetches
- **Paginated list endpoints** — all list endpoints return `{items, total, skip, limit}` to handle growing datasets
- **Atomic seed loading** — all seed data loads in one transaction, rolls back entirely on failure
- **Race condition immunity** — all read-then-write operations happen in single transactions; unique constraints are the real guard

### Estimated timeline

~9 sessions × 15 min average = ~2–3 hours of Claude Code time, plus your review/testing between phases.

### Tips

- **Tell Claude Code to read `ARCHITECTURE.md` first** at the start of each session after Phase 1.
- **If a phase runs long**, interrupt and continue — the success criteria tell you what's done and what's not.
- **If tests fail**, fix them in the same session before moving on. Tech debt compounds fast.
- **Phase 7 (assignment grid) is the most complex** single phase. If it's taking too long, split it: first implement `spectra.ts` utilities + tests, then the picker + table interaction.
- **If you change models between phases**, delete `panels.db` and restart the backend.
- **Check the NEVER FORGET checklist** in CLAUDE.md after every phase — it catches the most common Claude Code mistakes.
- **Run `test_routes.py`** after Phase 1 and after any routing changes — it catches double-prefix bugs immediately.
