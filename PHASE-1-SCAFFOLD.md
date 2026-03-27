# Phase 1: Project Scaffold

> **Context:** Read `ARCHITECTURE.md` first for full project spec. This phase creates the skeleton only.

## Goal

Set up the complete project structure, install dependencies, configure tooling, and create stub files so all subsequent phases can focus on implementation. Nothing should be functional yet — just importable, runnable (empty app renders, server starts), and test infrastructure works.

## Tasks

### 1. Backend scaffold

Create `flow-panel-designer/backend/` with:

- **`requirements.txt`**: fastapi, uvicorn[standard], sqlalchemy, pydantic, httpx (for FPbase calls), pytest, pytest-asyncio, httpx (test client)
- **`database.py`**: SQLAlchemy engine + sessionmaker pointed at `sqlite:///panels.db`, `Base` declarative base, `get_db` dependency. **CRITICAL: Add FK pragma event listener:**
  ```python
  from sqlalchemy import event

  @event.listens_for(engine, "connect")
  def set_sqlite_pragma(dbapi_connection, connection_record):
      cursor = dbapi_connection.cursor()
      cursor.execute("PRAGMA foreign_keys=ON")
      cursor.close()
  ```
- **`models.py`**: All SQLAlchemy models (Instrument, Laser, Detector, Fluorophore, Antibody, Panel, PanelTarget, PanelAssignment) with complete column definitions, relationships, and cascade deletes. Use UUID primary keys (stored as String(36) in SQLite). Use `str(uuid.uuid4())` as the default callable — NOT `uuid.uuid4` (that returns a UUID object, not a string).
  - **Panel.instrument_id is NULLABLE** (FK→Instrument, ondelete SET NULL). Panels survive instrument deletion.
  - **PanelTarget must include a unique constraint:**
    ```python
    __table_args__ = (
        UniqueConstraint('panel_id', 'antibody_id', name='uq_panel_target'),
    )
    ```
  - **PanelAssignment must include two unique constraints:**
    ```python
    __table_args__ = (
        UniqueConstraint('panel_id', 'antibody_id', name='uq_panel_antibody'),
        UniqueConstraint('panel_id', 'detector_id', name='uq_panel_detector'),
    )
    ```
  - **Every FK column must specify `ondelete`.** See the complete FK cascade rules table in `ARCHITECTURE.md`. Missing `ondelete` with FK pragma ON defaults to RESTRICT and causes unexpected IntegrityErrors.
- **`schemas.py`**: Pydantic v2 models for every request/response shape. Create, Read, and Update schemas per entity. Nest laser/detector schemas inside instrument schemas. Nest target and assignment schemas inside panel schemas. **All list endpoints use paginated response wrappers:**
  ```python
  class PaginatedResponse(BaseModel, Generic[T]):
      items: list[T]
      total: int
      skip: int
      limit: int
  ```
- **`main.py`**: FastAPI app with CORS middleware (allow all origins for dev), lifespan context manager (creates tables, placeholder for seed loading), include routers. **Router prefixes are set HERE, not in router files:**
  ```python
  app.include_router(instruments.router, prefix="/api/v1/instruments", tags=["instruments"])
  app.include_router(fluorophores.router, prefix="/api/v1/fluorophores", tags=["fluorophores"])
  app.include_router(antibodies.router, prefix="/api/v1/antibodies", tags=["antibodies"])
  app.include_router(panels.router, prefix="/api/v1/panels", tags=["panels"])
  ```
- **`routers/`**: One file per resource. Each file defines `router = APIRouter()` with **NO prefix argument**. Endpoint paths are relative (e.g., `@router.get("/")`, `@router.get("/{id}")`). Function signatures with `pass` or `raise NotImplementedError` bodies. Include stubs for:
  - `panels.py`: target endpoints (`POST /{id}/targets`, `DELETE /{id}/targets/{target_id}`) and assignment endpoints
  - `fluorophores.py`: `POST /batch-spectra` endpoint stub
- **`services/fpbase.py`**: Stub with `async def fetch_fluorophore(name: str) -> dict` that raises NotImplementedError.
- **`services/spillover.py`**: Stub with `def compute_spillover_matrix(...)` that raises NotImplementedError.
- **`seed_data/`**: Copy `fluorophores.json` from the `resources/` folder (pre-populated with ~48 fluorophores). Create `instruments.json` (`[]`) and `antibodies.json` (`[]`) — actual data comes in Phase 2.
- **`tests/conftest.py`**: pytest fixtures for test database (in-memory SQLite), test client (FastAPI TestClient), db session override. **CRITICAL: The test engine MUST also have the FK pragma event listener.** Use a fresh `create_engine("sqlite://")` with the same pragma setup.
- **`tests/test_models.py`**: Single test that creates one of each model and asserts it persists — validates the schema is correct. Include:
  - A test that all model PKs are `isinstance(model.id, str)` — catches the `uuid.uuid4` vs `str(uuid.uuid4())` bug.
  - A test that the FK pragma is active: insert a PanelAssignment with a non-existent panel_id → should raise IntegrityError.
  - A test for the PanelTarget unique constraint: insert same antibody twice for same panel → IntegrityError.
  - A test that Panel.instrument_id can be set to None without error.
- **`tests/test_routes.py`**: Verify that all endpoint paths resolve correctly (catches double-prefix bugs). This test hits actual full paths, not relative router paths:
  ```python
  """Verify all API routes resolve at their expected full paths.
  Catches double-prefix bugs where router files accidentally include a prefix."""

  EXPECTED_ROUTES = [
      ("GET", "/api/v1/instruments"),
      ("POST", "/api/v1/instruments"),
      ("GET", "/api/v1/instruments/{id}"),
      ("PUT", "/api/v1/instruments/{id}"),
      ("DELETE", "/api/v1/instruments/{id}"),
      ("GET", "/api/v1/fluorophores"),
      ("POST", "/api/v1/fluorophores"),
      ("GET", "/api/v1/fluorophores/{id}/spectra"),
      ("POST", "/api/v1/fluorophores/fetch-fpbase"),
      ("POST", "/api/v1/fluorophores/batch-spectra"),
      ("GET", "/api/v1/antibodies"),
      ("POST", "/api/v1/antibodies"),
      ("GET", "/api/v1/antibodies/{id}"),
      ("PUT", "/api/v1/antibodies/{id}"),
      ("DELETE", "/api/v1/antibodies/{id}"),
      ("GET", "/api/v1/panels"),
      ("POST", "/api/v1/panels"),
      ("GET", "/api/v1/panels/{id}"),
      ("PUT", "/api/v1/panels/{id}"),
      ("DELETE", "/api/v1/panels/{id}"),
      ("POST", "/api/v1/panels/{id}/targets"),
      ("DELETE", "/api/v1/panels/{id}/targets/{target_id}"),
      ("POST", "/api/v1/panels/{id}/assignments"),
      ("DELETE", "/api/v1/panels/{id}/assignments/{assignment_id}"),
  ]

  def test_all_expected_routes_exist(client):
      """Every expected route should be registered in the FastAPI app."""
      from main import app
      registered = set()
      for route in app.routes:
          if hasattr(route, "methods") and hasattr(route, "path"):
              for method in route.methods:
                  registered.add((method, route.path))
      for method, path in EXPECTED_ROUTES:
          assert (method, path) in registered, (
              "Route %s %s not found. Registered routes: %s"
              % (method, path, sorted(registered))
          )
  ```

### 2. Frontend scaffold

Create `flow-panel-designer/frontend/` with:

- **`package.json`**: Vite, React 18, TypeScript, Tailwind CSS 3, React Router DOM v6, chart.js, react-chartjs-2, chartjs-plugin-annotation, @tanstack/react-query. Include vitest + @testing-library/react for tests. **Do NOT install Recharts — use Chart.js for all charting.**
- Run `npm install`.
- **`vite.config.ts`**: Proxy `/api` → `http://localhost:8000`. **The proxy key is `/api` (not `/api/v1`).** Also configure vitest (including `resolve.alias` for `@/`) and path alias.
  ```typescript
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
  ```
  **Vitest resolve config must also include the `@/` alias:**
  ```typescript
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  }
  ```
- **`tailwind.config.js`**: Scan `./src/**/*.{ts,tsx}`.
- **`tsconfig.json`**: Strict mode, path alias `@/` → `src/`.
- **`index.html`**: Minimal, mounts `#root`.
- **`src/main.tsx`**: React root render with QueryClientProvider and BrowserRouter.
- **`src/App.tsx`**: Layout shell with sidebar (nav links to /instruments, /fluorophores, /antibodies, /panels) and `<Routes>` with placeholder pages. Each route renders a component that just shows `<h1>Page Name</h1>`.
- **`src/types/index.ts`**: TypeScript interfaces matching every backend Pydantic schema. **Include:**
  - The `fluorophore_id` field on the Antibody interface (nullable, for pre-conjugated antibodies).
  - The `PanelTarget` interface (`id`, `panel_id`, `antibody_id`, `sort_order`).
  - The `PaginatedResponse<T>` generic type.
  - `Panel.instrument_id` as `string | null`.
  ```typescript
  interface PaginatedResponse<T> {
    items: T[]
    total: number
    skip: number
    limit: number
  }
  ```
- **`src/api/`**: One file per resource. Each exports typed async functions (`listInstruments`, `createInstrument`, etc.) that call `fetch('/api/v1/...')`. These should work once the backend is live. List functions accept optional `skip`/`limit` params. Include:
  - `fluorophores.ts`: `batchSpectra(ids: string[])` function stub.
  - `panels.ts`: `addTarget(panelId, antibodyId)`, `removeTarget(panelId, targetId)` function stubs.
- **`src/components/layout/Sidebar.tsx`**: Nav sidebar component with links. Style with Tailwind — clean, minimal, light theme.
- **`src/components/layout/Shell.tsx`**: Main layout wrapper (sidebar + content area).
- **`src/hooks/`**: Stub custom hooks wrapping TanStack Query: `useInstruments.ts`, `useFluorophores.ts`, `useAntibodies.ts`, `usePanels.ts`. Each exports `useList`, `useCreate`, `useUpdate`, `useDelete` hooks with proper query keys but calling the api functions above. Query keys for list hooks include pagination params.
- **`src/utils/colors.ts`**: Laser color map object + `heatmapColor(value: number): string` function (white→yellow→orange→red interpolation). **Implement fully** — this is a pure utility with no dependencies. Breakpoints: 0.0→white, 0.1→yellow, 0.2→yellow, 0.3→orange, 0.5→orange-red, >0.5→red.
- **`src/utils/spillover.ts`**: Stub with exported function signature and `throw new Error("not implemented")`.
- **`src/utils/spectra.ts`**: Stubs for `interpolateAt(spectra, wavelength)`, `isExcitable(...)`, `isDetectable(...)`, `isCompatible(...)`, and `downsampleSpectra(spectra, stepNm)`. The `interpolateAt` function signature should be documented with a JSDoc comment explaining linear interpolation behavior.
- **`src/__tests__/colors.test.ts`**: Tests for heatmapColor: 0.0 → white-ish, 0.15 → yellow-ish, 0.4 → orange-ish, 0.7 → red-ish. Test laser color map has entries for 405, 488, 561, 637.
- Create empty component directories with `.gitkeep` or stub index files: `instruments/`, `fluorophores/`, `antibodies/`, `panels/`, `spectra/`.

### 3. Root files

- **`flow-panel-designer/ARCHITECTURE.md`**: Copy the full project context document here.
- **`flow-panel-designer/CLAUDE.md`**: Copy the Claude Code conventions file here.
- **`flow-panel-designer/resources/fetch_seed_spectra.py`**: Copy the seed spectra fetch script here.
- **`flow-panel-designer/README.md`**: Quick start instructions (install backend deps, install frontend deps, run both, seed data note).

## Python style rules (apply everywhere)

- No f-strings without placeholders. Use `str()`, `.format()`, or `%` for strings without interpolation.
- No multiple imports on one line (e.g., `import os, sys` is forbidden — use separate `import` statements).
- No semicolons to combine statements on one line.

## Tests to run before this phase is complete

```bash
# Backend
cd backend && pip install -r requirements.txt
python -c "from models import *; from schemas import *; print('Models and schemas import OK')"
python -c "from main import app; print('FastAPI app imports OK')"
pytest tests/test_models.py -v
pytest tests/test_routes.py -v

# Frontend
cd frontend && npm install
npx tsc --noEmit            # Type-check passes
npx vitest run              # colors.test.ts passes
npm run dev                 # App renders with sidebar and placeholder pages (manual check)
```

## Success criteria — ALL must pass before moving to Phase 2

1. `pytest tests/test_models.py` — all models create and persist in test DB; FK constraint test passes; PanelTarget unique constraint test passes; Panel with null instrument_id test passes; all model IDs are strings
2. `pytest tests/test_routes.py` — all expected endpoint paths are registered (no double-prefix bugs)
3. `npx tsc --noEmit` — zero TypeScript errors
4. `npx vitest run` — colors utility tests pass
5. Backend starts with `uvicorn backend.main:app` without crashing
6. Frontend starts with `npm run dev` and shows sidebar with 4 nav links + placeholder content
7. API fetch wrappers in `src/api/` are syntactically correct and properly typed (verified by tsc)
8. `seed_data/fluorophores.json` contains ~48 entries (copied from resources)
9. `PaginatedResponse` type exists in both Python schemas and TypeScript types
10. `PanelTarget` model exists with unique constraint
