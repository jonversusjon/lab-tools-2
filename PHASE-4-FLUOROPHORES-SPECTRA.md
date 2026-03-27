# Phase 4: Fluorophore Library + Spectra Viewer

> **Context:** Read `ARCHITECTURE.md`. Backend is complete (Phase 2), instrument UI works (Phase 3).
>
> **Before starting:** Run `cd backend && pytest tests/ -v && cd ../frontend && npx vitest run && npx tsc --noEmit` to confirm baseline is green.

## Goal

Build the `/fluorophores` page with a sortable table, single-fluorophore spectra viewer, multi-fluorophore overlay mode, and the reusable `SpectraViewer` component that later phases will also use. Also implement the FPbase fetch endpoint + UI, and the batch-spectra endpoint used by the panel designer.

## Tasks

### 1. Backend: FPbase integration

**`services/fpbase.py`** — implement fully:
- `async def fetch_fluorophore_from_fpbase(name: str) -> dict` using `httpx.AsyncClient`
- Query `https://www.fpbase.org/graphql/` with a POST request:
  ```python
  query = """
  query GetDye($name: String!) {
      dyes(name: $name) {
          name
          exMax
          emMax
          spectra {
              data
              subtype
          }
      }
  }
  """
  variables = {"name": name}
  response = await client.post(
      "https://www.fpbase.org/graphql/",
      json={"query": query, "variables": variables},
      timeout=15.0,
  )
  ```
- Parse response: filter spectra to `subtype == "EX"` and `subtype == "EM"`. The `data` field is a string of comma-separated `wavelength intensity` pairs — parse into `[[wavelength, intensity], ...]` format.
- If no "EX"/"EM" spectra found, also check for subtype "AB" (absorption, equivalent to excitation for dyes).
- Return dict matching Fluorophore schema fields.
- Handle errors:
  - Not found (empty dyes list) → raise HTTPException 404
  - Network errors / timeout → raise HTTPException 502 with message "FPbase service unavailable"
  - Multiple matches → take first

**`routers/fluorophores.py`** — implement `POST /fetch-fpbase`:
- Accepts `{"name": "BV711"}`
- Calls fpbase service
- If fluorophore with that name already exists → update its spectra, ex/em max, set source="fpbase", return it
- If new → create and return it with source="fpbase"
- On 502 from service → return 503 to client with message "Could not reach FPbase. Try again later."

**`routers/fluorophores.py`** — implement `POST /batch-spectra` (stubbed in Phase 2):
- Accepts `{"ids": ["uuid1", "uuid2", ...]}`
- Returns `{fluorophore_id: {"excitation": [...], "emission": [...]}, ...}`
- Limit to 100 IDs per request → 400 if more
- IDs not found are silently omitted from the response (not an error)
- This endpoint is critical for Phase 7/8 performance — the panel designer calls it once on mount

**`tests/test_fpbase.py`**:
- Test with mocked httpx response: valid FPbase GraphQL response → correct fluorophore dict parsed
- Test with mocked empty response → raises 404
- Test: fetch-fpbase endpoint creates new fluorophore (mock the external call at the service level)
- Test: fetch-fpbase endpoint updates existing fluorophore when name matches
- **All tests MUST mock the external HTTP call.** FPbase is not reachable from the test/build environment.

**`tests/test_fluorophores.py`** — add batch-spectra tests:
- Test: batch-spectra with valid IDs returns spectra keyed by ID
- Test: batch-spectra with mix of valid and invalid IDs returns only valid ones
- Test: batch-spectra with >100 IDs returns 400
- Test: batch-spectra with empty list returns empty dict

### 2. Frontend: Fluorophore table

**`components/fluorophores/FluorophoreTable.tsx`**:
- Table columns: checkbox (for overlay selection), name, Ex max (nm), Em max (nm), source
- Sortable by clicking column headers (client-side sort)
- Click a row (not checkbox) → opens spectra viewer for that single fluorophore below the table or in a slide-out panel
- Checkboxes: when 2+ checked, show "View Overlay" button → opens spectra viewer in multi mode
- "Fetch from FPbase" button at top → opens modal

**`components/fluorophores/FpbaseFetchModal.tsx`**:
- Simple modal (use the Modal component from Phase 5, or create a basic Tailwind modal here and refactor in Phase 5): text input for fluorophore name, "Fetch" button, loading state, error display
- On success: closes modal, invalidates fluorophore list query, shows success flash
- On 503 error: show "Could not reach FPbase. Try again later."
- On 404: show "Fluorophore not found on FPbase."

### 3. Frontend: SpectraViewer (reusable component)

**`components/spectra/SpectraViewer.tsx`**:

> **Use Chart.js via `react-chartjs-2` with `chartjs-plugin-annotation`, NOT Recharts.** Chart.js renders on canvas and handles dense spectra data (400+ points) without SVG performance issues.

Props interface:
```typescript
interface SpectraViewerProps {
  fluorophores: Array<{
    name: string
    spectra: { excitation: number[][], emission: number[][] }
    color?: string  // for multi-overlay mode
  }>
  mode: "single" | "overlay"
  // Optional overlays (used when embedded in panel designer later)
  laserLines?: number[]           // wavelengths to draw as vertical dashed lines
  detectorWindows?: Array<{       // bandpass rectangles
    midpoint: number
    width: number
    color?: string
  }>
}
```

**Before rendering:** Downsample spectra to every 2nm using `downsampleSpectra()` from `utils/spectra.ts` (implement this utility now — take every other point, or average adjacent points, to reduce from ~400 to ~200 points per curve).

**Single mode** (one fluorophore):
- Chart.js `Line` chart with:
  - Excitation dataset: dashed line, no fill
  - Emission dataset: solid line, filled with low opacity
- Both in the same color (use a nice default blue/teal)

**Overlay mode** (multiple fluorophores):
- Emission curves only, each a different color (use Wong palette or similar colorblind-safe palette)
- Legend showing fluorophore names with matching colors

**Both modes**:
- X-axis: wavelength 350–850nm, tick every 50nm
- Y-axis: normalized intensity 0–1, tick every 0.25
- Tooltip on hover: wavelength + intensity
- If `laserLines` provided: vertical annotation lines at those wavelengths using `chartjs-plugin-annotation`
- If `detectorWindows` provided: shaded box annotations for bandpass rectangles using `chartjs-plugin-annotation`

**Chart.js setup notes:**
- Register required components: `Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)`
- Also register the annotation plugin: `import annotationPlugin from 'chartjs-plugin-annotation'; Chart.register(annotationPlugin)`
- Set `pointRadius: 0` (no dots on curves), `tension: 0.1` (slight smoothing)
- Set `animation: false` for instant rendering on data change

### 4. Wire up hooks

**`useFluorophores.ts`**: `useList` (paginated), `useSpectra(id)` (fetches full spectra for one fluorophore), `useBatchSpectra(ids)` (batch fetch for panel designer — uses TanStack Query with `staleTime: 5 * 60 * 1000`), `useFetchFromFpbase` mutation.

### 5. Tests

**`frontend/src/__tests__/SpectraViewer.test.tsx`**:
- Test: renders in single mode with mock spectra data — canvas element present
- Test: renders in overlay mode with 3 fluorophores — legend shows 3 entries
- Test: component accepts laserLines prop without crashing
- Test: component accepts detectorWindows prop without crashing

**`frontend/src/__tests__/FluorophoreTable.test.tsx`**:
- Test: renders table rows from mock fluorophore list
- Test: clicking column header sorts the table
- Test: selecting checkboxes shows "View Overlay" button

**`backend/tests/test_fpbase.py`**: As described above.

## Tests to run

```bash
# Backend
cd backend && pytest tests/ -v --tb=short

# Frontend
cd frontend && npx vitest run && npx tsc --noEmit
```

## Success criteria — ALL must pass before moving to Phase 5

1. All backend tests pass (including new fpbase and batch-spectra tests)
2. All frontend tests pass
3. TypeScript clean
4. Manual verification:
   - `/fluorophores` shows ~48 seed fluorophores in a table
   - Click a row → spectra viewer shows excitation (dashed) + emission (filled) curves
   - Check 3 fluorophores → "View Overlay" → overlay chart shows 3 emission curves with legend
   - "Fetch from FPbase" → type "AF488" → fetches, appears in table, spectra viewable (if FPbase reachable; if not, error message displays correctly)
   - Fetching same name again updates rather than duplicates
   - Fetching nonexistent name shows "not found" error
   - Spectra charts render crisply with no lag even with dense data
   - Laser line and detector window annotations render correctly when props provided (can test via Storybook or by temporarily hardcoding props)
