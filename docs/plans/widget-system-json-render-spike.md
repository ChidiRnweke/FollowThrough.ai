# Widget system on json-render: spike findings

## Status and scope

This is a research spike. It contains no feature code. It records how a widget system can use
[json-render](https://github.com/vercel-labs/json-render), where each part fits in this codebase,
and what a prototype must prove first. Facts about the library were checked on 2026-10-03 against
the repository, the npm registry, and the package READMEs. Items marked **Unverified** were not
confirmed and need a prototype.

### Requirements

1. A widget is a small structured UI that is declared as JSON.
2. A note can embed a widget. A widget can also open on its own.
3. Widgets are stored in PostgreSQL.
4. An agent can edit the widget data and the widget structure.
5. A user can create a widget manually.
6. A user can change data through the widget (for example, tick a checkbox). The change is saved.

## 1. Summary and recommendation

Use `@json-render/core` and `@json-render/svelte`. Pin exact versions (0.21.0 at the time of
writing).

- An official Svelte 5 renderer exists. We do not need React or a custom renderer.
- The library requires `zod ^4`. This repository uses `zod ^4.4.3`.
- The license is Apache-2.0.
- The library separates structure (the spec) from data (the state). This matches requirements 4
  and 6 directly.

Model the widget on **diagrams**. Diagrams already have each part that widgets need:

| Need                  | Diagram precedent                                                         |
| --------------------- | ------------------------------------------------------------------------- |
| Own table             | `diagrams` in `src/lib/server/db/schema/registry.ts`                      |
| Embedded in notes     | `drawio` atom node that holds only `diagramId`                            |
| Viewable on its own   | `diagram:<id>` workbench tab and `src/routes/(app)/diagrams/[diagramId]/` |
| Agent create and edit | `create_diagram` and `edit_diagram` in `agent-tool-factory.ts`            |
| Offline sync          | `diagrams` workspace resource and the `saveDiagram` command               |

Do not store widgets inside note node attributes. That would block requirement 2 (open on its
own), cross-note embedding, and direct agent edits that do not rewrite the note.

## 2. json-render: the parts we use

**Catalog.** `defineCatalog(schema, { components, actions })`. Each component has a zod `props`
schema, a `description`, and optional `slots`. The catalog is the allow-list: a spec can use only
cataloged components and actions. `schema` comes from `@json-render/svelte/schema`.

**Spec.** A flat element map:

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
- `{ "$bindState": "/path" }` binds a value in both directions. This is how user edits reach state.
- `repeat: { statePath: "/items", key: "id" }` renders a list, with `$item`, `$bindItem` and
  `$index` inside it.
- `visible` takes comparisons (`eq`, `gt`, …), `$and` and `$or`.
- `$cond`, `$template` and `$computed` derive values.

**Actions.** Bound with `on.press`, `on.change` or `on.submit`. The built-in actions are
`setState`, `pushState`, `removeState` and `validateForm`. `watch` runs an action when a path
changes.

**Spec checks.** `validateSpec`, `autoFixSpec` (each fix is lossy or lossless; `{ lossy: false }`
keeps only lossless fixes), and `formatSpecIssues`.

**LLM helpers.** `catalog.prompt({ system, customRules })` generates the component reference for a
system prompt. `buildUserPrompt({ prompt, currentSpec, editModes, state })` frames an edit.
Edit modes are `patch` (RFC 6902), `merge` (RFC 7396) and `diff`. `diffToPatches(old, new)`
creates patches. SpecStream streams one JSON Patch per JSONL line through
`createSpecStreamCompiler`.

**Svelte package.** `@json-render/svelte` exports `Renderer`, `defineRegistry`, `JsonUIProvider`,
`StateProvider` (accepts `initialState` or a `store`), `ActionProvider`, `VisibilityProvider` and
`ValidationProvider`. Registry components are Svelte 5 snippets.

**Unverified:** the exact snippet signature for registry components, and whether the Svelte
`StateProvider` accepts a controlled external store in the same way as the React provider.

## 3. Data model

Add a `widgets` table in `src/lib/server/db/schema/registry.ts`, next to `diagrams`. Add the
migration as the next file in `drizzle/`.

| Column                          | Type                     | Reason                                                    |
| ------------------------------- | ------------------------ | --------------------------------------------------------- |
| `id`                            | uuid                     | Same as other tables.                                     |
| `userId`                        | uuid, cascade            | Owner scoping.                                            |
| `projectId`                     | uuid, cascade            | Project scope (ADR 0008).                                 |
| `sourceNoteId`                  | uuid, set null           | Where the widget was created. Other notes can also embed. |
| `conversationId`                | uuid, set null           | The agent conversation that created it, if any.           |
| `title`                         | text                     | Tab label and search.                                     |
| `spec`                          | jsonb                    | Structure: `root` and `elements`. No `state` key.         |
| `state`                         | jsonb                    | Data.                                                     |
| `catalogVersion`                | integer                  | The catalog version that the spec was validated against.  |
| `specRevision`, `stateRevision` | integer                  | Separate optimistic concurrency guards (ADR 0010).        |
| `searchableText`                | text                     | Search indexing (ADR 0019).                               |
| `archivedAt`                    | timestamp                | Soft delete, same as diagrams.                            |
| `...timestamps`                 | `createdAt`, `updatedAt` | Shared spread.                                            |

**Keep structure and data in separate columns.** They change at different rates and for different
reasons. Agents and authors change the spec rarely. Users change state often. Separate revisions
let a user tick a checkbox while an agent changes the layout, without a conflict. The spec
`state` field from json-render is split out on write and joined back on read.

**Parse at the boundary (ADR 0037).** `jsonb` `$type<T>()` is compile-time only. The DB mapper in
`src/lib/server/db/mappers.ts` must parse both columns:

- `spec`: a zod spec schema in `src/lib/models/widgets/`, then `validateSpec` against the catalog.
- `state`: `z.json()`, a recursive JSON value schema. The repository already uses it, for example
  in `src/lib/server/factories/agent/tool-result-projectors.ts`. Do not use `z.unknown()`; the
  strict layers ban it.
- List reads return one `{ status: 'unreadable' }` value per bad row, like `toStoredSuggestion`.
  One bad row must not break a whole list. Single reads fail loudly.

**Revisions.** Start with a spec revision table only, so a user can restore an old layout
(ADR 0011 pattern). State history is high-volume and has no clear user need yet. Decide this
during the prototype.

## 4. Catalog and rendering

- **Catalog** in `src/lib/models/widgets/`: component names, zod props schemas and descriptions.
  This is values and schemas only, which is what models may hold.
- **Registry** in `src/lib/components/widgets/`: one Svelte snippet per catalog component, built on
  the vendored `src/lib/components/ui/` primitives. Do not use `@json-render/shadcn-svelte`. The
  design system stays ours (ADR 0005, `docs/design/design-system.md`).
- **Starter catalog:** Stack, Card, Heading, Text, Metric, Progress, Checkbox, Checklist, Table,
  Input, Select, Badge, Divider. Add components only when a template or an agent use case needs
  them.
- **Catalog versions.** Store `catalogVersion` on each widget. When a stored spec names a component
  that the catalog no longer has, render a visible "unsupported element" placeholder and keep the
  element in the stored spec. Never drop it silently (ADR 0015).
- **Security boundary.** Agents write specs, so specs are untrusted. In v1, allow only the built-in
  state actions. Do not add custom actions that do I/O. Do not add components that take free-form
  URLs, HTML or iframes. A later link component must validate its URL scheme in its props schema.

## 5. Embedding in notes

Add a `widgetNode` atom block with one `widgetId` attribute. Follow the `drawio` and `todoNode`
path:

1. `WidgetNodeBase` in `src/lib/components/edra/commands/nodes.ts`, with
   `createAtomBlockMarkdownSpec({ nodeName: 'widgetNode', allowedAttributes: ['widgetId'] })`.
   Agents and imports read notes as Markdown, so the node must survive that round trip.
2. Add it to `noteMarkdownExtensions` in `src/lib/components/edra/commands/markdown-extensions.ts`.
   A node that is missing from that list is erased when a note is serialized.
3. Add a `withNodeView` factory in `src/lib/components/edra/commands/BuiltinExtensions.ts`. Pass the
   extension from `note-editor.svelte` and `note-diff-editor.svelte` as an extra extension, as
   `TodoNode` is passed. The Svelte view lives in `src/lib/components/widgets/`, because
   `components/edra/` may not import `models/`.
4. Add a zod arm, a TypeScript interface and a `KNOWN_NODE_TYPES` entry in
   `src/lib/models/notes/index.ts`.
5. Add `widgetReferencesIn` to `src/lib/services/notes/references.ts`, next to
   `drawioReferencesIn`.
6. Add a "Widget" slash command in `src/lib/components/edra/commands/commands.ts`, next to
   "Project diagram". It opens a picker: an existing project widget, a template, or "describe it".
7. Update `src/lib/components/notes/editor-schema-conformance.spec.ts`.

The node view reads the widget from the workspace session, like `todo-node.svelte`. In read-only
and review panes (no `perNote`), it renders a non-interactive preview.

## 6. Standalone view

Follow the diagram tab:

- `src/lib/stores/workbench/tab-ref.ts`: a `widget` arm, the `widget:<uuid>` prefix, and helpers
  (`widgetTab`, `widgetIdOf`, `isWidgetTab`).
- `src/lib/models/workbench/index.ts`: extend the `workbenchTabIdSchema` pattern.
- `src/lib/stores/workbench/workbench-url.ts`: handle `/widgets/<id>` in focus parsing.
- `src/lib/components/shell/workbench/workspace-pane.svelte`: a `WidgetPane` branch. Also update
  the tab strip grouping and `projectOfTab` in `src/routes/(app)/+layout.svelte`.
- `src/routes/(app)/widgets/[widgetId]/`: mirror `diagrams/[diagramId]/+page.ts`.

## 7. Saving user-edited data

Widgets become a synchronized workspace resource (ADR 0040), so that user edits work offline and
use the same rules on both sides (ADR 0041):

- Add `widgets` to `workspaceResourceTypeSchema` (`src/lib/models/workspace-sync/index.ts`) and to
  `resourceDataSchemas` (`src/lib/models/workspace-records/index.ts`).
- Register it in `src/lib/server/repositories/workspace/sync-catalog.ts`.
- Add `saveWidgetState` and `saveWidgetSpec` commands in `src/lib/models/workspace-mutations/`, and
  dispatch them in `src/lib/remote/workspace/mutations.remote.ts`.
- Put the domain rules in one shared service, `src/lib/services/widgets/edits.ts`: apply a JSON
  Patch, validate the result, and compute `searchableText`. The client optimistic path, the server
  write and the agent tools all call it.

**State store bridge.** Implement json-render's `StateStore` interface over the workspace record.
Debounce `$bindState` writes into one `saveWidgetState` command.

**Merge granularity (ADR 0042).** The outbox replays local writes with a three-way field merge, and
asks the user only when both sides changed the same field. If `state` is one field, two edits to
different keys in the same widget overlap and cause review. The prototype must decide whether the
widget `rebase` function merges `state` per JSON Pointer path, or whether whole-value replay is
acceptable for the first version.

## 8. Agent tools

Follow `create_diagram` and `edit_diagram` in `src/lib/server/factories/agent/agent-tool-factory.ts`.

| Tool                  | Class    | Input                                                  |
| --------------------- | -------- | ------------------------------------------------------ |
| `read_widget_catalog` | read     | none; returns `catalog.prompt()`                       |
| `read_widget`         | read     | `widgetId`; returns spec, state and both revisions     |
| `create_widget`       | mutation | title, spec, initial state, optional `noteId` to embed |
| `update_widget_state` | mutation | RFC 6902 patch on state, `expectedStateRevision`       |
| `edit_widget_spec`    | mutation | RFC 6902 patch on spec, `expectedSpecRevision`         |

- **Separate data and structure tools.** A data edit cannot break the layout, and approval can
  treat the two differently.
- **Catalog on demand (ADR 0022).** The catalog prompt is large. A read tool supplies it only when
  the agent works on widgets, instead of adding it to every run.
- **Validation as recovery.** After a spec patch, run `validateSpec` and
  `autoFixSpec({ lossy: false })`. Return `formatSpecIssues` output as a `ValidationError`, so the
  model can correct the patch.
- **Approval (ADR 0003).** The tools are mutations, so they wait for approval when the run requires
  it. The approval preview (`src/lib/components/chat/actions/tool-approval-preview.ts`) should
  render the widget before and after the change.
- **Wiring.** Follow the controller checklist in `AGENTS.md`: `TOOL_DESCRIPTIONS` in
  `src/lib/models/agent/tool-catalog.ts`, `AgentToolCoverage`, `AgentToolOutputMap`,
  `src/lib/server/factories/controller-surfaces.ts`, `src/lib/server/application.ts`, and a
  `widgets-capability-factory.ts` like `diagrams-capability-factory.ts`.

**Risk: strict tool schemas.** Tool inputs go to the model as strict JSON Schema
(`jsonObjectSchema` in `src/lib/server/factories/agent/tool-call-boundary.ts`, `strict: true` in
`sdk-tool-adapter.ts`). Strict mode requires `additionalProperties: false` and every property in
`required`. An arbitrary JSON value, such as a patch `value`, a spec element map or a state
object, cannot be described that way. The probable fix is to accept these as JSON strings and parse
them in the tool's parse step. The diagram tools already take diagram source as a string. The first
prototype slice must confirm this.

**Existing inconsistency.** `TOOL_DESCRIPTIONS` classifies `create_diagram` as `read`, but
`agentToolCoverage` classifies `createDiagram` as `mutation`. Fix or explain this before widget
tools copy the pattern.

## 9. Creating widgets manually

Version 1:

- **Templates.** A small gallery: checklist, metric row, progress tracker, table. Each template is a
  spec and a seed state in `src/lib/models/widgets/`.
- **JSON editor.** In the standalone view, an advanced panel edits the spec and the state as JSON.
  It validates while the user types and shows `formatSpecIssues` output.
- **Describe it.** Starts an agent run that uses `create_widget`.

A visual builder is out of scope.

## 10. Search, export and provenance

- **Search.** Build `searchableText` from text props in the spec and string values in the state, so
  the existing chunk pipeline finds widgets (ADRs 0019 and 0020).
- **Export.** Note export needs a static form. `src/lib/components/notes/export/render-diagrams.ts`
  is the precedent. **Open:** render a static snapshot, or a Markdown table or list from the state.
- **Provenance.** Record the agent conversation in `conversationId`, as diagrams do.

## 11. Risks and open questions

- **Library maturity.** json-render is pre-1.0. It had more than 15 minor releases in about nine
  months, and minor versions can break. Pin exact versions. Keep library imports inside
  `components/widgets/` and `services/widgets/`.
- **Unverified Svelte API.** The snippet signature and the controlled `store` prop.
- **Strict tool schemas.** See section 8.
- **State merge granularity.** See section 7.
- **Catalog drift.** Old specs that name removed components or old prop shapes. A migration per
  catalog version, or tolerant rendering with placeholders.
- **Bundle size.** Measure the renderer and the core package. Load the widget renderer only when a
  widget is visible.
- **Scope.** Widgets are project-scoped (ADR 0008). Decide whether a note in one project can embed
  a widget from another project. The diagram precedent says no.

## 12. Proposed prototype slices

Each slice is one PR.

1. **Render.** Pin the packages. Render one hard-coded spec with two-way state in a test route.
   Proves the Svelte snippet API and the store bridge. Acceptance: a browser test ticks a checkbox
   and reads the new state.
2. **Store.** Table, migration, mapper, repository, service, controller and remote.
   Acceptance: a stored spec with an unknown component reads as unreadable, not as a crash.
3. **Embed and view.** `widgetNode`, slash command, `widget:` tab and route. Acceptance: a widget
   in a note survives a Markdown round trip and opens in its own tab.
4. **Agent tools.** The five tools and the strict schema check. Acceptance: an evaluation case
   creates a widget, then changes only its state (ADR 0023).
5. **Sync.** Workspace resource, commands and the merge decision. Acceptance: an offline state edit
   applies after reconnecting.
6. **Manual creation.** Templates and the JSON editor.
