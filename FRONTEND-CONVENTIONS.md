# Frontend Conventions

## Component Patterns

### File Organization
- One component per file. Name file same as component.
- Colocate types with components if only used there; shared types go in `types/index.ts`.
- Hooks that wrap TanStack Query go in `hooks/`. One file per resource.

### State Management
- Server state: TanStack Query (no Redux, no Zustand).
- Local UI state: `useState` for simple, `useReducer` for complex (panel designer).
- No prop drilling beyond 2 levels — use composition or context.

### API Layer
- All fetch calls in `src/api/` files. Components never call `fetch()` directly.
- All API functions are async and return typed data.
- Error handling: let TanStack Query handle retries. API functions throw on non-2xx.
```typescript
// Pattern for API functions
export async function listInstruments(
  skip: number = 0,
  limit: number = 100
): Promise<PaginatedResponse<Instrument>> {
  const response = await fetch(
    "/api/v1/instruments?skip=" + String(skip) + "&limit=" + String(limit)
  )
  if (!response.ok) {
    throw new Error("Failed to fetch instruments: " + response.statusText)
  }
  return response.json()
}
```

### Pagination
All list endpoints return paginated responses. Use the shared type:
```typescript
interface PaginatedResponse<T> {
  items: T[]
  total: number
  skip: number
  limit: number
}
```
Hooks accept optional `skip`/`limit` params and include them in query keys:
```typescript
queryKey: ['antibodies', { skip, limit }]
```

### TanStack Query Keys
```typescript
queryKey: ['instruments']                          // unpaginated shorthand (uses defaults)
queryKey: ['instruments', { skip, limit }]         // paginated list
queryKey: ['instruments', id]                      // detail
queryKey: ['fluorophores', id, 'spectra']          // single spectra
queryKey: ['fluorophores', 'batch-spectra']        // batch spectra cache
queryKey: ['panels', id, 'targets']                // panel targets
```
Mutations invalidate the list key on success:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['instruments'] })
}
```

### Batch Spectra Caching
The panel designer needs spectra data for compatibility checks and spillover. Instead of N+1 fetches:
```typescript
// In the panel designer, fetch all spectra once on mount
const { data: spectraCache } = useQuery({
  queryKey: ['fluorophores', 'batch-spectra'],
  queryFn: () => batchSpectra(allFluorophoreIds),
  staleTime: 5 * 60 * 1000,  // 5 minutes
  enabled: allFluorophoreIds.length > 0,
})
```
Pass `spectraCache` to `FluorophorePicker` and `computeSpilloverMatrix`. Never trigger spectra fetches from inside these components.

### PanelTarget Pattern
Targets (antibodies added to a panel) are persisted to the backend via the PanelTarget model. They survive page reloads.
```typescript
// Adding a target — POST first, then update local state
const addTarget = async (antibodyId: string) => {
  const target = await api.addTarget(panelId, antibodyId)
  dispatch({ type: 'ADD_TARGET', target })  // target has backend-assigned ID
}

// Removing a target — DELETE from backend (cascades to assignment), then update local state
const removeTarget = async (targetId: string, antibodyId: string) => {
  await api.removeTarget(panelId, targetId)
  dispatch({ type: 'REMOVE_TARGET', targetId, antibodyId })
}
```
Targets are NOT optimistic — the POST is fast and we want the backend-assigned ID. Assignments ARE optimistic (latency matters for the interactive grid).

### Modal Pattern
Use the shared `Modal` component from `components/layout/Modal.tsx`.
```tsx
<Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Edit Antibody">
  {/* form content */}
</Modal>
```

### Loading / Error / Empty States
Every data-dependent component must handle three states:
```tsx
if (isLoading) return <Spinner />
if (error) return <ErrorMessage error={error} />
if (data.items.length === 0) return <EmptyState message="No instruments yet" />
```

### Null Instrument State
Panels can have `instrument_id = null`. The panel designer must handle this:
- Show "Select an instrument to begin designing" prompt
- Target rows can still be added/removed (PanelTargets don't depend on instrument)
- No detector columns rendered
- No assignment interaction possible
- Instrument dropdown shows empty/placeholder selection

### Chart.js Conventions
- Use `react-chartjs-2` `<Line>` component for all spectra charts.
- Register required components at app startup or in a shared setup file:
  ```typescript
  import {
    Chart,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend
  } from 'chart.js'
  import annotationPlugin from 'chartjs-plugin-annotation'
  Chart.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend,
    annotationPlugin
  )
  ```
- Always set `animation: false` for instant re-renders on data change.
- Set `pointRadius: 0` — no dots on spectra curves.
- Downsample spectra to every 2nm before passing to Chart.js.
- Use `chartjs-plugin-annotation` for laser lines (vertical dashed lines) and detector windows (shaded box annotations).

### Pre-conjugated Antibody Patterns
- In antibody table: show fluorophore name badge for conjugated, "Unconjugated" in grey for null.
- In panel designer target rows: show conjugation status.
- In fluorophore picker: if antibody is pre-conjugated, only show the conjugated fluorophore (locked).
- In assigned cells: show lock icon (🔒) for pre-conjugated assignments.

### Tailwind Conventions
- Max width for content areas: `max-w-7xl mx-auto`
- Card: `bg-white rounded-lg shadow p-6`
- Table: `min-w-full divide-y divide-gray-200`
- Button primary: `bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded`
- Button danger: `bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded`
- Button secondary: `bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded`

## Testing Patterns
- Use `@testing-library/react` with `vitest`.
- Mock API hooks at module level, not individual fetch calls.
- Use `renderHook` from `@testing-library/react` for hook tests.
- For reducer tests, test the reducer function directly (no rendering needed).
```typescript
vi.mock('@/hooks/useInstruments', () => ({
  useInstruments: () => ({
    data: mockInstruments,
    isLoading: false,
    error: null,
  }),
}))
```
- For Chart.js: mock `react-chartjs-2` in tests since canvas isn't available in jsdom:
```typescript
vi.mock('react-chartjs-2', () => ({
  Line: (props: any) => <canvas data-testid="chart" />,
}))
```

### Vitest Path Alias Configuration
The `@/` path alias must be configured in vitest's resolve config, not just in tsconfig. Without this, test imports using `@/` will fail:

```typescript
// vite.config.ts — test section
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

This must match the alias in the main `resolve.alias` config and `tsconfig.json` paths.
