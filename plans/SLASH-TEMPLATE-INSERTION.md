# Slash menu — template-aware insertion via `.` dot trigger

Status: **in progress**

## Design intent

The slash menu currently inserts only blank blocks. Researchers building
experiments routinely want to insert a flow or IF panel already populated with
targets, antibodies, fluorophores, instrument, and detector assignments from a
previously designed template. Today that means inserting a blank block and
re-entering everything by hand, or using the `+` button path (the
`PanelTemplatePicker` modal — a context switch out of the keyboard-driven
editor flow).

This work adds a keyboard-only inline path: `/` → type a few letters → `.` →
searchable template omnibox → arrow + Enter. No mouse, no modal, no context
switch. The dot key is dedicated as the template trigger because (a) it is
typographically distinct from the slash, (b) users do not typically type `.`
mid-block-name, and (c) it gives a clear escape valve for "I want the template
version" without conflicting with Enter-to-insert-blank.

A registry pattern (`TemplateProvider` interface, `TEMPLATE_PROVIDERS` map keyed
by slash item title) is intentional architecture for extensibility: future
block types with template libraries (qPCR primer panels, plate layouts,
microscope acquisition presets) plug in by implementing the interface, with zero
changes to `SlashMenuList`, `SlashPopupContainer`, or the suggestion plugin
wiring.

`ARCHITECTURE.md (§ Experiment Pages)` is the authoritative source for block
content JSON. This work touches only the insertion path; the persisted block
content shape is unchanged.

## Approach: server-side snapshot-preview endpoint (Option 3a)

The node JSON for a populated panel is produced server-side by a single shared
serializer, so the slash-omnibox path, the (future-wired) modal path, and the
persistence path all emit byte-identical content. The client `buildNodeJSON`
becomes one `fetch()` to a read-only preview endpoint — no client-side field
gathering, no multi-cache reconciliation.

## Implementation steps

1. **`refactor(panels)`** — extract the panel-snapshot serializer from
   `routers/experiments.py::snapshot_panel` into `services/panel_snapshot.py`
   (`build_flow_panel_snapshot`, `build_if_panel_snapshot`), each returning the
   `{ type, attrs }` Tiptap node shape. The `snapshot_panel` route is rewired to
   call the helpers and wrap the result in an `ExperimentBlock`. Behavior
   unchanged; existing tests still pass.
2. **`feat(api)`** — `GET /api/v1/panels/{id}/snapshot-preview` and
   `GET /api/v1/if-panels/{id}/snapshot-preview`, returning the serializer
   output as `PanelSnapshotPreview { type, attrs }`. No DB writes. Pytest asserts
   the preview JSON matches what `snapshot_panel` embeds for the same template.
3. **`feat(slashMenu)`** — `TemplateProvider` interface + registry skeleton
   (`templateProviders/types.ts`, `index.ts`, stub `flowProvider`/`ifProvider`).
4. **`feat(slashMenu)`** — flow + IF providers. `buildNodeJSON` is a single
   `fetch()` to the preview endpoint. `prefetchList`/`readList`/`isListLoading`
   operate on the TanStack list caches.
5. **`feat(slashMenu)`** — thread `QueryClient` through the extension options;
   prefetch both template lists on slash-menu open.
6. **`feat(slashMenu)`** — `SlashPopupContainer` owning `'list' | 'omnibox'`
   mode, routing keys, and intercepting `.` (swallowed always; switches to
   omnibox only when the highlighted item has a provider).
7. **`feat(slashMenu)`** — `TemplateOmnibox` component. `buildNodeJSON` is async
   and fast (one HTTP round trip); a brief loading state shows on Enter/click.
8. **`test(slashMenu)`** — dot-trigger, omnibox, and provider coverage.
   Providers test against a simple `fetch` mock.
9. **`docs(conventions)`** — templateProvider registry pattern + snapshot-preview
   convention; mark this plan complete.

## Decision log

- **Option 3a (preview endpoint) chosen over client-side reimplementation.** A
  single server-side source of truth (`services/panel_snapshot.py`) eliminates
  drift risk between the persistence path and the insertion path. The detail
  endpoints (`GET /panels/{id}`, `/if-panels/{id}`) omit fields the snapshot
  embeds (dilution factors needed for volume math, antibody host/clone,
  fluorophore/detector/filter display names, the full nested
  instrument/microscope); reproducing those client-side would have meant
  gathering from multiple caches with ongoing backend-sync burden. The
  (currently unwired) `PanelTemplatePicker` modal path will adopt the same
  endpoint when it is wired up.
- This supersedes the original phase prompt's "no `snapshot-panel`" forbidden
  pattern, which was written assuming a reusable client-side transform already
  existed behind `PanelTemplatePicker`. It did not — the only live transform was
  the server-side `snapshot_panel` route.

## Lessons learned

_(to be filled at completion)_
