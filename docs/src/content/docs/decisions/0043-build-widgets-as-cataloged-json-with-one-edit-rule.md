---
title: 'ADR 0043: Build widgets as cataloged JSON with one edit rule'
description: Every widget change, from a person, a template or an agent, is one typed edit that one shared rule applies.
---

## Status

Accepted. The widget table, its synchronization, its rendering, the note embed, the standalone
page and the agent edit tools are in place. The section "What still needs a decision" lists the
parts that are not decided yet. The research and the remaining work are in
`docs/plans/widget-system-json-render-spike.md`.

## Context

A widget is a small structured user interface, such as a checklist, a metric row or a table, that
is declared as data instead of code. A note can embed a widget. A widget can also open on its own.
People create widgets from templates or by hand, and they change widget data through the widget,
for example by ticking a checkbox. Agents change both the data and the structure of a widget.
Widgets are stored in PostgreSQL and are edited offline like other workspace records (ADR 0040).

These are five sources of change: user interaction, manual editing, templates, agent tools and
offline replay. If each source has its own procedure, each one validates, merges and saves in its
own way. The browser can then show a widget that the server rejects, and an agent can save a
structure that a person cannot open.

[json-render](https://github.com/vercel-labs/json-render) renders a user interface from a JSON spec.
The spec is restricted to a catalog of components with Zod prop schemas. It keeps structure (the
spec) separate from data (the state), and it has an official Svelte 5 renderer. It is pre-1.0.

## Decision

### A widget is a reference, a layout and data

A widget is its own project-scoped entity (ADR 0008). It is not part of a note document. A note
embeds a widget through a `widgetNode` atom block that holds only `widgetId`, as the `drawio` node
holds only `diagramId`. Many notes can embed one widget. The widget opens as a `widget:<id>` workbench tab beside other
tabs, or as a page at `/widgets/<id>`. The agent's app context names the widget that is open, so
`read_widget` can find it.

The saved widget has two independent parts. Each part has its own revision:

```ts
interface Widget {
	readonly id: WidgetId;
	readonly projectId: ProjectId;
	readonly sourceNoteId?: NoteId;
	readonly title: string;
	readonly catalogVersion: number;
	readonly layout: WidgetLayout; // the json-render spec without `state`
	readonly layoutRevision: number;
	readonly data: WidgetData; // the json-render state: an object of JSON values
	readonly dataRevision: number;
	// owner and timestamps omitted
}
```

`layout` and `data` are our domain terms. The json-render terms `spec` and `state` appear only
where the library is called. Layout changes are rare and deliberate. Data changes are frequent and
small. Separate revisions let a person tick a checkbox while an agent changes the layout, and
neither write is stale.

A request to create a widget is a separate type, `WidgetDraft`, with no id and no revisions. A
template is a `WidgetDraft` value. Creation by hand, by template and by an agent produce the same
draft.

### Every change is a `WidgetChange`, guarded where it is sent

What a change does is one discriminated union. `JsonPatch` is an RFC 6902 operation list:

```ts
type WidgetChange =
	| { readonly kind: 'data'; readonly patch: JsonPatch }
	| { readonly kind: 'layout'; readonly patch: JsonPatch }
	| { readonly kind: 'rename'; readonly title: string };
```

A change needs a guard against writing over something the sender did not see, and each path has
exactly one:

- **The workspace queue sends a bare `WidgetChange`.** The queue's base version is the guard
  (ADR 0040), and a conflict is replayed and sent again (ADR 0042). A change is an intent, so the
  same patch still applies to the newer widget. A revision in the command would make every
  replayed change stale.
- **Agent tools send a `WidgetEdit`**, the same change plus the revision of the part it touches
  (`expectedDataRevision` or `expectedLayoutRevision`). They write on the server, where there is no
  queue base, so the revision is their only guard.

Each source does one job, which is to translate its input into a `WidgetChange`, a `WidgetEdit`
or a `WidgetDraft`:

| Source                 | Produces                                                        |
| ---------------------- | --------------------------------------------------------------- |
| A bound widget control | a `data` change, from the state store bridge                    |
| The "Widget" command   | a `WidgetDraft`, from a template                                |
| `edit_widget_data`     | a `data` edit, from the tool arguments                          |
| `edit_widget_layout`   | a `layout` edit, from the tool arguments                        |
| Offline replay         | the queued `createWidget` or `editWidget` command, unchanged    |
| The manual JSON editor | `data` or `layout`, from a diff of the edited value (not built) |

No source validates, merges or saves a widget by itself.

### One rule applies an edit

One shared service, `src/lib/services/widgets/edits.ts`, owns the meaning of an edit (ADR 0041):

```ts
type WidgetEditResult =
	| { readonly kind: 'applied'; readonly widget: Widget }
	| { readonly kind: 'invalid'; readonly issues: readonly WidgetIssue[] }
	| { readonly kind: 'stale'; readonly part: 'data' | 'layout'; readonly currentRevision: number };

applyWidgetChange(widget, change, catalog, now): WidgetEditResult;
applyWidgetEdit(widget, edit, catalog, now): WidgetEditResult; // revision check + applyWidgetChange
createWidget(draft, creation, catalog): WidgetEditResult;
```

The functions are total and do no I/O. `applyWidgetChange` applies the patch to a copy and
validates the result. The browser calls it to show the optimistic result before it queues a
command, and the server calls it again against the locked, current widget before it writes.
`applyWidgetEdit` first checks the revision of the part the edit touches; the agent tools reach it
through the controller's `edit`.

The patch is applied by an immutable RFC 6902 applier in the same service, not by json-render's
`applySpecStreamPatch`. That function mutates its input in place, throws on a failed operation, and
is typed over untyped records. A patch output is not narrow until it is checked, because an
operation can replace an element with a number. The rule therefore checks the output against the
part's schema. This is validation of a computed value inside the rule, not a parse of outside
input: the edit itself was parsed where it arrived.

Failures are values. `invalid` carries issues with a JSON Pointer path and a message, which an
agent tool returns as a recoverable validation failure. `stale` names the part and its current
revision, so a caller can read the widget again and retry.

### The catalog is the allow-list

`widgetCatalog` is a versioned value in `src/lib/models/widgets/`: component names, Zod prop
schemas, slots and descriptions. Version 1 has Stack, Card, Heading, Text, Checkbox, Progress and
Metric. A layout can use only these components. A prop is either a literal that matches the
component's schema or one of a fixed set of state expressions (`$state`, `$bindState`, `$item`,
`$bindItem`, `$index`, `$template`). Element bindings may use only the json-render built-in state
actions (`setState`, `pushState`, `removeState`, `validateForm`). Version 1 leaves out `visible`
and `watch`. There are no custom actions that do I/O, and no component that takes free-form URLs,
HTML or frames. Agents write layouts, so a layout is untrusted input.

json-render's own `catalog.validate` does not check props when a catalog has more than one
component, so the rule checks each element's props against the catalog itself. The library's
`validateSpec` supplies the structural checks: the root exists, children exist, and a repeat names
an array in the data.

A stored layout records its `catalogVersion`. When a layout names a component that the current
catalog does not have, the renderer shows a visible unsupported-element placeholder. The stored
element is kept (ADR 0015).

### The library stays behind two seams

json-render is imported in two places only:

- `src/lib/services/widgets/`, for `validateSpec` inside the edit rule.
- `src/lib/components/widgets/`, for rendering. The registry maps each catalog component to a
  Svelte component built on our own `src/lib/components/ui/` primitives (ADR 0005). We do not use
  `@json-render/shadcn-svelte`.

Models define the stored layout and data schemas with Zod and do not import the library. The
versions are pinned exactly. A library upgrade changes two directories.

### The view turns control changes into data changes

`WidgetView` gives json-render a controlled `createStateStore` seeded with the widget data, and
subscribes to it. In controlled mode the library ignores `onStateChange`, so the subscription is
the only reliable signal. On each change the view reads the store snapshot with
`widgetDataSchema`, computes the smallest patch with `diffWidgetData`, and hands one `data` change
to its owner. Ticking one checkbox produces one `replace` of that
item's flag. A record revision that the view did not produce, from sync or an agent, replaces the
store. Without an edit handler the view is read-only.

### Widgets are a synchronized workspace resource

Widgets use the shared queue, receipts and version guard of ADR 0040, with `createWidget` and
`editWidget` commands. The replay of ADR 0042 has a widget arm. Title and layout replay field by
field. `data` merges path by path in `rebaseWidgetParts`: a local and a remote data change merge
when they commute, which means the local patch applied to the remote data equals the remote patch
applied to the local data. Ticks of different items commute. Two changes to one value do not, and
neither does a change inside a list whose length the other side changed, because the diff replaces
such a list whole. Those go to review. Each revision in the replayed value is the newer one,
advanced once for each part the local edit changed, as the server will advance it.

Widget changes never coalesce in the queue. A patch is relative to the version before it, so
replacing a queued change with a later one would drop the earlier patch.

### A widget is recoverable

A widget moves to the trash, comes back from it, and is deleted only from it
(`archiveWidget`, `restoreWidget`, `deleteWidget`; the rules are in
`src/lib/services/widgets/trash.ts`). An agent can create and change widgets, so an unwanted one
must be recoverable, as a diagram is (ADR 0003). The trash is a user gesture in the project's
widget gallery and the trash page; agents have no tool for it. A note that embeds a widget in the
trash shows that it is in the trash and offers Restore, and keeps the reference. A widget in an
archived project is hidden like everything else in the project (ADR 0009). Before a widget moves
to the trash, the gallery says how many notes embed it.

### Boundaries parse, the inside is total

The Postgres repository parses `layout` and `data` with the model schemas where rows leave the
database (ADR 0037). A row that does not parse fails the read. The workspace sync reader parses the
same record schema in the browser. Agent tool arguments and workspace commands are parsed into
`WidgetEdit` and `WidgetDraft` at their boundaries. Services and controllers receive only resolved
values.

### The controller has one edit operation

`WidgetsController` exposes `synchronize`, `get`, `list`, `create`, `edit(actor, input)`,
`archive`, `restore` and `delete`. It
does not have one method for each kind of change. Workspace commands and agent tools map onto
these operations.

Agent tools stay separate for data and layout, so approval and evaluation can tell them apart (ADRs
0003 and 0023). Both are mutations and wait for approval when the run requires it. Strict tool
schemas cannot describe an arbitrary JSON value: Zod emits `oneOf` and an open
`additionalProperties`, and the tool boundary keeps only top-level properties. So the patch crosses
the tool boundary as a JSON string and is parsed there into a `JsonPatch`. The diagram tools take
their source as a string for the same reason.

### What still needs a decision

- **Agent creation and the catalog prompt.** `create_widget` and a read tool for
  `catalog.prompt()` (ADR 0022) are not built.
- **Approval preview.** The approval card shows the generic tool arguments. It does not yet render
  the widget as `applyWidgetEdit` would leave it.
- **Layout history.** Whether layout revisions are kept for restore (ADR 0011). Data history is
  not kept.

## Consequences

- Every source of change shares one validation, one revision check and one failure vocabulary.
- An agent cannot save a layout that the catalog rejects.
- A data edit and a layout edit to one widget do not conflict.
- A new source of change only translates its input into a `WidgetEdit`.
- A new kind of change adds an arm to `WidgetEdit` and a case to `applyWidgetEdit`. The type
  checker finds every consumer that must handle it.
- The catalog limits what widgets can show. A new component needs a catalog entry and a registry
  component; the registry's `satisfies` clause fails the type check until both exist.
- json-render upgrades are confined to two directories but can still break those directories,
  because the library is pre-1.0.

## Evidence

- `src/lib/services/widgets/edits.spec.ts` checks the rule: revisions per part, catalog and prop
  rejection, structural rejection, and the smallest data diff.
- `tests/integration/widgets/repositories.contract.spec.ts` checks the Postgres round trip, owner
  isolation and the revision guard.
- `tests/integration/sync/widget-mutations.contract.spec.ts` checks `createWidget` and
  `editWidget` through `synchronize`: applied, conflict on a stale base, a change replayed onto a
  remote edit of another item, and rejection of an uncataloged layout.
- `src/lib/controllers/workspace/rebase.spec.ts` and the replay cases in `edits.spec.ts` check the
  path merge, and `src/lib/client/sync/indexeddb-outbox.svelte.spec.ts` checks that a replayed
  widget change is queued again with its change unchanged.
- `src/lib/components/widgets/widget-view.svelte.spec.ts` checks that a ticked checkbox becomes
  one `data` edit, the read-only view, and the unsupported-element placeholder.
- `src/lib/server/factories/agent/widget-tools.spec.ts` checks that `edit_widget_data` saves
  through the shared rule, that rejected edits name the problem, and that the tool parameters
  convert to strict JSON Schema.
- `src/lib/services/widgets/trash.spec.ts` checks the trash rules, the lifecycle cases in
  `widget-mutations.contract.spec.ts` check them on Postgres, and
  `src/lib/controllers/workspace/archived-collections.spec.ts` checks that an archived project
  hides its widgets.
- `src/lib/stores/workbench/tab-ref.spec.ts`, `workbench-url.spec.ts` and
  `src/lib/stores/agent/app-context.svelte.node.spec.ts` check the `widget:` tab, its URL and
  the agent surface.
- `tests/e2e/widgets.e2e.ts` creates a widget from a note, ticks it, reloads, and edits it in its
  tab. A second case moves it to the trash from the gallery, sees the note show it as trashed, and
  restores it.
