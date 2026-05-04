# E2E tests

Playwright suite verifying the migration's manual-verification protocol.
Tests touch the production SQLite DB at `backend/panels.db` and depend on
a backup of cK009 at `~/ck009-backup-20260502.sql`.

## Running

1. **Backend must be running** in a separate terminal:
   ```bash
   cd backend && uvicorn main:app --reload --port 8000
   ```

2. **Frontend dev server starts automatically** via Playwright's `webServer`
   config when you run:
   ```bash
   cd frontend && npm run e2e
   ```

   For interactive debugging:
   ```bash
   npm run e2e:ui      # Playwright's UI mode
   npm run e2e:headed  # see the browser
   ```

3. **The cK009 backup must exist** at `~/ck009-backup-20260502.sql`
   (or set `CK009_BACKUP` env var to override the path).

4. **Tests run serially** (workers: 1, fullyParallel: false) because they
   share the SQLite DB. Do not change this.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `LAB_TOOLS_DB` | `~/proj/lab-tools-2/backend/panels.db` | Path to the SQLite DB |
| `CK009_BACKUP` | `~/ck009-backup-20260502.sql` | Path to the cK009 SQL backup |

## Test categories

- `ck009.spec.ts` — production data integrity (cK009 doesn't drift on load or reload)
- `indicator.spec.ts` — save indicator state transitions (idle → dirty → saved → undo)
- `beforeunload.spec.ts` — beforeunload guard fires when pending, releases when saved
- `paste.spec.ts` — paste correctness (_rowId stripping via transformPasted)
- `sandbox-create.spec.ts` — sandbox auto-create idempotency + seed block topology

## Production code changes for testability

Two minimal changes were made to production code:

1. **`data-testid="save-status"`** added to the save-status `<span>` in
   both `ExperimentPage.tsx` and `TiptapSandbox.tsx`. Provides a stable
   selector for indicator assertions.

2. **`window.__sandboxEditor`** exposed in `TiptapSandbox.tsx` under
   `import.meta.env.DEV` guard. Allows paste tests to read the editor's
   internal `_rowId` state via `page.evaluate`. Tree-shaken in production
   builds.

## What's NOT covered

- Visual regression (no screenshot comparisons)
- Multi-tab sync (post-merge work)
- The actual browser "are you sure" dialog — tested at the JavaScript level
  via `event.defaultPrevented` instead
- Production code paths that don't touch the editor (panels, fluorophores, etc.)

## Known gaps

If new migration phases add behavior worth automating, add a test file here
rather than expanding the manual verification protocol.
