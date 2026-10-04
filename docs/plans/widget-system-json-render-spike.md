# Widget system on json-render: spike and remaining work

## Status and scope

The spike built the critical path end to end:

1. A user creates a widget from a template in a note.
2. The widget is stored in PostgreSQL as a synchronized workspace record.
3. It renders with json-render, both in the note and at `/widgets/<id>`.
4. A ticked checkbox is saved through the offline queue and is still there after a reload.
5. An agent can read the widget and edit its data or its layout.

The decisions are in
[ADR 0043](../src/content/docs/decisions/0043-build-widgets-as-cataloged-json-with-one-edit-rule.md).
This document keeps the library facts that the decisions rest on, the seams the implementation
created, and the work that remains. Delete it when the remaining work lands.

Library facts were read from the json-render v0.21.0 source on 2026-10-03.

## 1. json-render facts the implementation depends on

- **Packages.** `@json-render/core` and `@json-render/svelte`, pinned at 0.21.0. Both need
  `zod ^4`; the Svelte package needs Svelte 5. Apache-2.0. Pre-1.0, with more than 15 minor
  releases in about nine months.
- **Registry entries are Svelte components, not snippets.** The README shows snippets; the code
  takes components. Each receives `{ props, children, bindings, emit, on }`, with expressions in
  `props` already resolved. A component writes a bound value back through
  `getBoundProp(() => props.x, () => bindings?.x)`.
- **Controlled state.** `JsonUIProvider` accepts a `store`. With a store, `initialState` and
  `onStateChange` are ignored, so `WidgetView` observes the store with `subscribe`. The store from
  `createStateStore` copies along the changed path and never writes into its input.
- **`spec.state` is not applied automatically.** The data seeds the store instead.
- **Validation.** `validateSpec` checks structure only. `catalog.validate` checks component names
  but not props once a catalog has more than one component, and it strips `on`, `watch` and
  `state` from its output.
- **Patching.** `applySpecStreamPatch` mutates in place and throws on failure. The edit rule uses
  its own immutable applier instead.
- **Errors in a component are swallowed.** Each element renders inside a `svelte:boundary` that
  only logs, so a broken component disappears. The registry components must not throw.

## 2. Where each seam is

| Seam                    | Location                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Types, schemas, catalog | `src/lib/models/widgets/index.ts`                                                       |
| Edit rule and diff      | `src/lib/services/widgets/edits.ts`                                                     |
| Table and migrations    | `widgets` in `src/lib/server/db/schema/registry.ts`, `drizzle/0059_*`, `drizzle/0060_*` |
| Repository              | `src/lib/server/repositories/widgets/`                                                  |
| Controller              | `src/lib/server/controllers/widgets/controller.ts`                                      |
| Sync commands           | `createWidget` and `editWidget` in `src/lib/models/workspace-mutations/index.ts`        |
| Browser command rule    | `prepareWorkspaceCommand` in `src/lib/controllers/workspace/commands.ts`                |
| Edit staging            | `src/lib/stores/widgets/widget-edits.svelte.ts`                                         |
| Rendering               | `src/lib/components/widgets/` (registry, `widget-view`, `widget-pane`, `widget-node`)   |
| Note embed              | `WidgetNodeBase` and the "Widget" slash command in `src/lib/components/edra/commands/`  |
| Standalone page         | `src/routes/(app)/widgets/[widgetId]/`                                                  |
| Agent tools             | `read_widget`, `edit_widget_data`, `edit_widget_layout` in `agent-tool-factory.ts`      |

**Development database.** The dev database is push-managed. `0060_widgets_workspace_sync.sql`
installs the sync triggers for the widgets table and is idempotent, so `pnpm db:sync:setup` runs
it after `0051`.

## 3. Remaining work

Each item is one PR. Each revises ADR 0043 and adds its specs to the ADR's Evidence section.

1. **Agent creation.** Add `create_widget` (a `WidgetDraft` sent as a JSON string, the same as the
   patch) and `read_widget_catalog`, which returns `catalog.prompt()` (ADR 0022). Add an evaluation
   case that creates a widget and then changes only its data (ADR 0023).
2. **Approval preview.** Render the widget as `applyWidgetEdit` would leave it in
   `src/lib/components/chat/actions/tool-approval-preview.ts`, instead of the generic arguments.
3. **Search and export.** A searchable text for the knowledge index (ADRs 0019 and 0020), and a
   static form for note export (`src/lib/components/notes/export/render-diagrams.ts` is the
   precedent).
4. **Housekeeping.** `TOOL_DESCRIPTIONS` classifies `create_diagram` as `read`, but
   `agentToolCoverage` classifies it as `mutation`. Resolve it before more tools copy the pattern.
