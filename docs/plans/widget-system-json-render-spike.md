# Widget system on json-render: spike findings

## Status and scope

This is a research spike and an implementation plan. It contains no feature code. The design
decisions are in
[ADR 0043](../src/content/docs/decisions/0043-build-widgets-as-cataloged-json-with-one-edit-rule.md):
the `Widget` and `WidgetDraft` types, the `WidgetEdit` union, the `applyWidgetEdit` rule, the
catalog allow-list, and the two library seams. This document does not repeat those decisions. It
records the library research, where each seam lands in the codebase, the risks, and the order of
the implementation slices.

Library facts were checked on 2026-10-03 against the json-render repository, the npm registry and
the package READMEs. Items marked **Unverified** need a prototype. Delete this document when the
last slice lands.

## 1. Why json-render fits

- `@json-render/svelte` is an official Svelte 5 renderer. We need no React and no custom renderer.
- The library requires `zod ^4`. This repository uses `zod ^4.4.3`.
- The license is Apache-2.0.
- The library separates the spec (our layout) from the state (our data). This matches the
  separate edit kinds in ADR 0043.
- It is pre-1.0, with more than 15 minor releases in about nine months. Pin exact versions
  (0.21.0 at the time of writing).

Diagrams are the precedent for each part outside the library:

| Need                  | Diagram precedent                                                         |
| --------------------- | ------------------------------------------------------------------------- |
| Own table             | `diagrams` in `src/lib/server/db/schema/registry.ts`                      |
| Embedded in notes     | `drawio` atom node that holds only `diagramId`                            |
| Viewable on its own   | `diagram:<id>` workbench tab and `src/routes/(app)/diagrams/[diagramId]/` |
| Agent create and edit | `create_diagram` and `edit_diagram` in `agent-tool-factory.ts`            |
| Offline sync          | `diagrams` workspace resource and the `saveDiagram` command               |

## 2. json-render: the parts we use

**Catalog.** `defineCatalog(schema, { components, actions })`. Each component has a Zod `props`
schema, a `description`, and optional `slots`. `schema` comes from `@json-render/svelte/schema`.

**Spec.** A flat element map. ADR 0043 stores the spec without `state` as the layout, and `state`
as the data:

```json
{
	"root": "card",
	"elements": {
		"card": { "type": "Card", "props": { "title": "Launch" }, "children": ["done"] },
		"done": {
			"type": "Checkbox",
			"props": { "label": "Ship", "checked": { "$bindState": "/ship" } },
			"children": []
		}
	},
	"state": { "ship": false }
}
```

Every element needs `children`; leaves use `[]`. Optional props use `.nullable()` in the README
examples, not `.optional()`.

**State.** Expressions address state by JSON Pointer:

- `{ "$state": "/path" }` reads a value.
- `{ "$bindState": "/path" }` binds a value in both directions. This is how a control produces a
  `data` edit.
- `repeat: { statePath: "/items", key: "id" }` renders a list, with `$item`, `$bindItem` and
  `$index` inside it.
- `visible` takes comparisons (`eq`, `gt`, …), `$and` and `$or`.
- `$cond`, `$template` and `$computed` derive values.

**Actions.** Bound with `on.press`, `on.change` or `on.submit`. The built-in actions are
`setState`, `pushState`, `removeState` and `validateForm`. `watch` runs an action when a path
changes.

**Spec checks.** `validateSpec`, `autoFixSpec` (each fix is lossy or lossless; `{ lossy: false }`
keeps only lossless fixes), and `formatSpecIssues`. These run inside `applyWidgetEdit`.

**LLM helpers.** `catalog.prompt({ system, customRules })` generates the component reference for
the catalog read tool. `buildUserPrompt({ prompt, currentSpec, editModes, state })` frames an edit.
`diffToPatches(old, new)` turns a manual JSON edit into a patch.

**Svelte package.** `Renderer`, `defineRegistry`, `JsonUIProvider`, `StateProvider` (accepts
`initialState` or a `store`), `ActionProvider`, `VisibilityProvider` and `ValidationProvider`.
Registry components are Svelte 5 snippets.

**Unverified:** the exact snippet signature for registry components, and whether the Svelte
`StateProvider` accepts a controlled external store in the same way as the React provider.

## 3. Where each seam lands

### Value types and catalog

- `src/lib/models/widgets/`: `Widget`, `WidgetDraft`, `WidgetEdit`, `WidgetEditResult`,
  `WidgetIssue`, the layout schema, the catalog, and the templates (as `WidgetDraft` values).
- `src/lib/services/widgets/edits.ts`: `applyWidgetEdit` and `createWidget`, and the
  `searchableText` derivation. Precedent: `src/lib/services/todos/edits.ts`.

### Storage

- `widgets` table in `src/lib/server/db/schema/registry.ts`, next to `diagrams`. Columns: `id`,
  `userId`, `projectId`, `sourceNoteId` (set null), `conversationId` (set null), `title`, `layout`
  jsonb, `data` jsonb, `catalogVersion`, `layoutRevision`, `dataRevision`, `searchableText`,
  `archivedAt`, and the shared timestamps. Add the migration as the next file in `drizzle/`.
- Mapper in `src/lib/server/db/mappers.ts`. `toStoredSuggestion` is the precedent for unreadable
  list rows. `z.json()` is already used, for example in
  `src/lib/server/factories/agent/tool-result-projectors.ts`.
- Repository role interfaces, such as `WidgetFinder` and `WidgetWriter`, follow
  `src/lib/server/services/diagrams/contracts.ts`. The writer guards each part with its revision.

### Controller and wiring

Follow the controller checklist in `AGENTS.md`: the controller in
`src/lib/server/controllers/widgets/controller.ts`, a `widgets-capability-factory.ts` like
`diagrams-capability-factory.ts`, `src/lib/server/application.ts`,
`src/lib/server/factories/controller-surfaces.ts`, and a remote in `src/lib/remote/widgets/`.

### Note embedding

1. `WidgetNodeBase` in `src/lib/components/edra/commands/nodes.ts`, with
   `createAtomBlockMarkdownSpec({ nodeName: 'widgetNode', allowedAttributes: ['widgetId'] })`.
2. Add it to `noteMarkdownExtensions` in `src/lib/components/edra/commands/markdown-extensions.ts`.
   A node that is missing from that list is erased when a note is serialized.
3. A `withNodeView` factory in `src/lib/components/edra/commands/BuiltinExtensions.ts`. Pass the
   extension from `note-editor.svelte` and `note-diff-editor.svelte`, as `TodoNode` is passed. The
   Svelte view lives in `src/lib/components/widgets/`, because `components/edra/` may not import
   `models/`.
4. A Zod arm, an interface and a `KNOWN_NODE_TYPES` entry in `src/lib/models/notes/index.ts`.
5. `widgetReferencesIn` in `src/lib/services/notes/references.ts`, next to `drawioReferencesIn`.
6. A "Widget" slash command in `src/lib/components/edra/commands/commands.ts`, next to "Project
   diagram". It opens a picker: an existing project widget, a template, or "describe it".
7. Update `src/lib/components/notes/editor-schema-conformance.spec.ts`.

The node view reads the widget from the workspace session, like `todo-node.svelte`. Without
`perNote` (read-only and review panes), it renders a non-interactive preview.

### Standalone view

- `src/lib/stores/workbench/tab-ref.ts`: a `widget` arm and helpers.
- `src/lib/models/workbench/index.ts`: extend the `workbenchTabIdSchema` pattern.
- `src/lib/stores/workbench/workbench-url.ts`: handle `/widgets/<id>`.
- `src/lib/components/shell/workbench/workspace-pane.svelte`: a `WidgetPane` branch. Also the tab
  strip grouping and `projectOfTab` in `src/routes/(app)/+layout.svelte`.
- `src/routes/(app)/widgets/[widgetId]/`: mirror `diagrams/[diagramId]/+page.ts`.

### Offline sync

- `widgets` in `workspaceResourceTypeSchema` (`src/lib/models/workspace-sync/index.ts`) and
  `resourceDataSchemas` (`src/lib/models/workspace-records/index.ts`).
- Register in `src/lib/server/repositories/workspace/sync-catalog.ts`.
- One `editWidget` command that carries a `WidgetEdit`, in `src/lib/models/workspace-mutations/`,
  dispatched in `src/lib/remote/workspace/mutations.remote.ts`. The client side is
  `src/lib/controllers/workspace/commands.ts`.
- The replay function sits next to `src/lib/controllers/workspace/rebase.ts`.
- The state store bridge implements json-render's `StateStore` and debounces control changes into
  `data` edits.

### Agent tools

In `src/lib/server/factories/agent/agent-tool-factory.ts`, next to `create_diagram` and
`edit_diagram`:

| Tool                  | Class    | Maps to                        |
| --------------------- | -------- | ------------------------------ |
| `read_widget_catalog` | read     | `catalog.prompt()`             |
| `read_widget`         | read     | `get`                          |
| `create_widget`       | mutation | `create`, with a `WidgetDraft` |
| `edit_widget_data`    | mutation | `edit`, with a `data` edit     |
| `edit_widget_layout`  | mutation | `edit`, with a `layout` edit   |

Register each tool in `TOOL_DESCRIPTIONS` (`src/lib/models/agent/tool-catalog.ts`),
`AgentToolCoverage` and `AgentToolOutputMap`. The approval preview in
`src/lib/components/chat/actions/tool-approval-preview.ts` renders the result of
`applyWidgetEdit`.

## 4. Risks

- **Strict tool schemas.** Tool inputs go to the model as strict JSON Schema (`jsonObjectSchema`
  in `src/lib/server/factories/agent/tool-call-boundary.ts`, `strict: true` in
  `sdk-tool-adapter.ts`). Strict mode requires `additionalProperties: false` and every property in
  `required`, so it cannot describe an arbitrary JSON value. The diagram tools already take diagram
  source as a string, which is the probable pattern. ADR 0043 lists this as open.
- **Data merge granularity under ADR 0042.** Listed as open in ADR 0043.
- **Unverified Svelte API.** The snippet signature and the controlled `store` prop.
- **Catalog drift.** Old layouts that name removed components or old prop shapes.
- **Bundle size.** Measure the renderer and the core package. Load the renderer only when a widget
  is visible.
- **Export.** Note export needs a static form of a widget.
  `src/lib/components/notes/export/render-diagrams.ts` is the precedent.
- **Existing inconsistency.** `TOOL_DESCRIPTIONS` classifies `create_diagram` as `read`, but
  `agentToolCoverage` classifies `createDiagram` as `mutation`. Resolve this before the widget tools
  copy the pattern.

## 5. Implementation slices

Each slice is one PR. Each slice revises ADR 0043 when it answers an open question, and adds its
specs to the ADR's Evidence section.

1. **Types and rule.** The value types, the catalog, `applyWidgetEdit` and `createWidget`, with
   specs. Prove the Svelte renderer with one stored layout and the state store bridge. Answers the
   store bridge and patch implementation questions. Acceptance: a browser test ticks a checkbox,
   and the bridge produces the expected `data` edit.
2. **Storage.** Table, migration, mapper, repository, controller and remote. ADR 0043 becomes
   Accepted. Acceptance: a stored layout with an uncataloged component reads as unreadable in a
   list, not as a failure of the list.
3. **Embed and view.** `widgetNode`, slash command, `widget:` tab and route. Acceptance: a widget in
   a note survives a Markdown round trip and opens in its own tab.
4. **Agent tools.** The five tools. Answers the tool argument format question. Acceptance: an
   evaluation case creates a widget, then changes only its data (ADR 0023).
5. **Sync.** Workspace resource, the `editWidget` command and the replay function. Answers the merge
   granularity question. Acceptance: an offline data edit applies after reconnecting.
6. **Manual creation.** Templates and the JSON editor.
