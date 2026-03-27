# Phase 5: Antibody Inventory UI

> **Context:** Read `ARCHITECTURE.md`. Backend CRUD for antibodies already works (Phase 2). This phase is frontend only.
>
> **Before starting:** Run `cd backend && pytest tests/ -v && cd ../frontend && npx vitest run && npx tsc --noEmit` to confirm baseline is green.

## Goal

Build the `/antibodies` page with a table and create/edit modal. This is a straightforward CRUD view — simpler than instruments or fluorophores. Establish the modal pattern here that panels will reuse.

## Tasks

### 1. Antibody table

**`components/antibodies/AntibodyTable.tsx`**:
- Columns: target, clone, host, isotype, conjugate (fluorophore name or "Unconjugated"), vendor, catalog #
- The "conjugate" column should display:
  - If `fluorophore_id` is set: fluorophore name with a small colored badge
  - If null: "Unconjugated" in grey italic text
- Sortable by target column
- Searchable: filter/search input at top that filters rows by target name (client-side)
- "New Antibody" button → opens form modal
- Click row → opens form modal in edit mode
- Delete button per row (with confirmation: "Deleting this antibody will also remove it from any panels where it is a target or has assignments. Continue?")

### 2. Antibody form modal

**`components/antibodies/AntibodyForm.tsx`**:
- Modal dialog (use the shared Modal component)
- Fields:
  - **Target** (required text input)
  - Clone (optional text)
  - Host (optional text)
  - Isotype (optional text)
  - **Fluorophore** (dropdown of all fluorophores from library, optional). Label this field "Conjugate" in the UI. When null/empty, this antibody is unconjugated. When set, the antibody is pre-conjugated. Show helper text: "Leave empty for unconjugated antibodies. Set for pre-conjugated antibodies (e.g., anti-CD3-FITC)."
  - Vendor (optional text)
  - Catalog Number (optional text)
- Save button: POST (new) or PUT (edit)
- Cancel button: closes modal
- Validation: target is required, rest optional

### 3. Wire up hooks

**`useAntibodies.ts`**: Already stubbed. Ensure `useList`, `useCreate`, `useUpdate`, `useDelete` all work. The list query should also be used by the panel designer later (for the target search dropdown), so make sure the hook is clean and reusable.

### 4. Shared modal component

Create a generic modal used by this form and future components:

**`components/layout/Modal.tsx`**:
- Props: `isOpen`, `onClose`, `title`, `children`
- Tailwind styling: overlay, centered card, close button, title bar
- Escape key closes, click overlay closes
- Reuse this in `AntibodyForm` and future components

### 5. Tests

**`frontend/src/__tests__/AntibodyTable.test.tsx`**:
- Test: renders rows from mock data
- Test: search input filters rows by target name
- Test: "New Antibody" button click calls the open-modal handler
- Test: pre-conjugated antibody shows fluorophore name in conjugate column
- Test: unconjugated antibody shows "Unconjugated" text

**`frontend/src/__tests__/AntibodyForm.test.tsx`**:
- Test: renders empty form for new antibody
- Test: renders pre-populated form for editing (including fluorophore dropdown selection)
- Test: submit with empty target shows validation error
- Test: submit with valid data calls the create/update handler

**`frontend/src/__tests__/Modal.test.tsx`**:
- Test: renders children when open
- Test: does not render when closed
- Test: Escape key triggers onClose

## Tests to run

```bash
cd frontend
npx vitest run
npx tsc --noEmit
```

## Success criteria — ALL must pass before moving to Phase 6

1. All vitest tests pass
2. TypeScript clean
3. Manual verification:
   - `/antibodies` shows ~10 seed antibodies, all showing "Unconjugated"
   - Search "CD" → filters to CD-prefixed targets
   - Click "New Antibody" → modal opens, fill in target "TUJ1", host "mouse", save → appears in table, persists on reload
   - Click "New Antibody" → set target "CD3", select "FITC" from conjugate dropdown, save → shows "FITC" in conjugate column
   - Click existing antibody → modal opens pre-populated, edit clone, save → change persists
   - Delete an antibody → gone from table, persists on reload
   - Fluorophore dropdown in form shows all ~48 library fluorophores
