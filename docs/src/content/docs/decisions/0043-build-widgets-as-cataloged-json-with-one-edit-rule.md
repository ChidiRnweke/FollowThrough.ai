---
title: 'ADR 0043: Build widgets as cataloged JSON with one edit rule'
description: Every widget change, from a person, a template or an agent, is one typed edit that one shared rule applies.
---

## Status

Accepted. Widgets are stored, synchronized, rendered in notes and in their own tab, edited by
people and agents, kept in a recoverable trash, found by search and printed in exports. The
section "What still needs a decision" lists what is not decided.

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
	| { readonly kind: 'parts'; readonly layout: JsonPatch; readonly data: JsonPatch }
	| { readonly kind: 'rename'; readonly title: string };
```

`parts` is a layout and a data change that only make sense together, such as a new list and the
array it shows. It is checked once, after both patches, so neither half has to be valid alone.

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
| `create_widget`        | a `WidgetDraft`, from the tool arguments                        |
| `edit_widget_data`     | a `data` edit, from the tool arguments                          |
| `edit_widget_layout`   | a `layout` edit, from the tool arguments                        |
| Offline replay         | the queued `createWidget` or `editWidget` command, unchanged    |
| The JSON editor        | changes from `widgetChangesBetween`, a diff of the edited value |

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
schemas, slots and descriptions. Version 3 has Stack, Grid, Card, Heading, Text, Checkbox,
Progress, Metric, TextInput, NumberInput, Slider, Select, Table, DataTable, Badge, Button,
LineChart, AreaChart, BarChart and Divider, and adds the layout's `derived` formulas and
`sources`. A version only adds, so every older layout stays valid. A layout can use only these components. A prop is either a literal that matches the
component's schema or one of a fixed set of state expressions (`$state`, `$bindState`, `$item`,
`$bindItem`, `$index`, `$template`). Element bindings may use only the json-render built-in state
actions (`setState`, `pushState`, `removeState`, `validateForm`). `visible` takes exactly
json-render's visibility conditions, modelled as a recursive schema; `watch` is left out. There are no custom actions that do I/O, and no component that takes free-form URLs,
HTML or frames. Agents write layouts, so a layout is untrusted input.

json-render's own `catalog.validate` does not check props when a catalog has more than one
component, so the rule checks each element's props against the catalog itself. The library's
`validateSpec` supplies the structural checks: the root exists, children exist, and a repeat names
an array in the data.

A stored layout records its `catalogVersion`. When a layout names a component that the current
catalog does not have, the renderer shows a visible unsupported-element placeholder. The stored
element is kept (ADR 0015).

### Formulas compute values from the data

A widget that simulates, totals or scores needs values computed from its data, such as a savings
balance from a deposit and a rate. The layout has an optional `derived` map of named formulas:

```json
"derived": {
	"growth": "series(0, @/years, { year: i, balance: round(@/start * (1 + @/rate / 1200) ^ (12 * i)) })",
	"final": "last(@/derived/growth)"
}
```

Each result is in the rendered state at `/derived/<name>`, so components read it with the existing
`$state` expression and no new prop expression is needed. A computed value is never saved:
`derived` is a reserved top-level key that data may not have, a control may not `$bindState` into
it, and the view removes it from the store snapshot before it diffs. A formula is part of the
layout, so changing it is a layout change.

The formula language is closed. It has numbers, text, booleans, lists and records; `@/path`
references into the state; arithmetic, comparison and logical operators; and a fixed list of
functions (`round`, `min`, `sum`, `if`, `format`, `series`, `map`, `filter` and others). It has no
loops, no user functions and no I/O. `series`, `map` and `filter` bind `i` and `item` for their
body only. Evaluation has a step budget of 200,000 steps per widget, so an agent-written formula
cannot freeze the tab. A thirty-year monthly schedule costs about 4,000.

- **Parsing is part of the layout schema.** `parseFormula` (`src/lib/models/widget-formulas/`)
  turns source into a typed AST, and `widgetLayoutSchema` refuses a formula that does not parse, a
  read of an undefined derived value, and formulas that read each other in a circle. The stored
  value stays the source text, so the layout remains plain JSON for diff, sync and replay.
- **Evaluation is one shared rule.** `resolveWidgetState(layout, data)`
  (`src/lib/services/widgets/formulas.ts`) evaluates each formula lazily, so the order of keys in
  `jsonb` does not matter. The view, export and the server call this one function, so a value
  does not depend on where the widget is shown.
- **A failure is a value.** Division by zero, or a reference to text where a number is needed,
  makes that formula `null` and adds an issue naming it. The view lists the issues under the widget.
  The data edit that caused the failure is still accepted, because a person typing `0` must not be
  refused.
- **json-render's `$computed` is not used.** It calls registered JavaScript functions with untyped
  arguments in the browser only, so export and the server could not share it.

### Lists grow and tables edit in place

A `Button` runs only the built-in state actions: `pushState` adds a list item (`"$id"` makes its
id, and `clearStatePath` empties the field it came from), `removeState` removes one, and
`setState` sets a value. An action may not write a computed root. A `DataTable` binds a whole
array with `$bindState`; each column has a kind (`text`, `number`, `checkbox` or `select`) that
chooses the shadcn control in its cells. An edit writes the array back with one cell changed, so
the view's diff is a `replace` of that cell alone, and two people editing different rows merge
as two ticks do. Adding or removing a row changes the array's length and replaces it whole,
which the replay treats as an overlap. A `footer` reads a record of values per column, usually a
derived total. Export prints the table with ticks for checkboxes and option labels for choices.
The read-only `Table` stays for computed rows.

### Dashboards lay out by the widget's width

A `Grid` places its children in up to four columns. The columns follow the widget's own width
through a CSS container query on the view, not the window's: the same widget sits in a narrow
note column and in a full-width tab, and drops to one column as it narrows. A `Slider` over the
shadcn primitive binds a number between `min` and `max` and shows it beside its label, so a
simulator responds as the thumb moves. Every widget element wraps a shadcn-svelte primitive;
only layout and type (Stack, Grid, Heading, Text) are plain token classes.

### Charts are shadcn-svelte charts

LineChart, AreaChart and BarChart plot rows of numbers: `rows` is usually a derived `series`, `x`
names the field along the bottom, and each of up to five series names a numeric field. Each
element is a thin adapter over the vendored shadcn-svelte Chart (`src/lib/components/ui/chart/`),
which wraps [LayerChart](https://layerchart.com). The adapter maps catalog props to a
`ChartConfig` and a LayerChart series list, and nothing else. Charts are not drawn by hand: the
primitive is ours to edit like every other one in `components/ui/` (ADR 0005), and its tooltip,
legend and axes follow the design tokens. LayerChart is pinned exactly, as json-render is.

Export prints a chart as the table of the values it plots, under its title. LayerChart 2.5.1
cannot render on the server: in `Layer.svelte` an inner snippet named `children` shadows the
prop it renders, and the server render fails. Rasterizing the browser chart would need a
client bundle inside the export browser. The table carries the same numbers, which is what a
reader of a printed page needs. If LayerChart's server render is fixed, the existing
`DiagramRasterizer` can turn its SVG into an image without other changes.

### Dashboards read the user's own work

A layout's optional `sources` map names read-only lists of the user's work in the widget's
project: `"sources": { "todos": { "kind": "todos" } }`. The rows are in the rendered state at
`/sources/<name>`, and formulas count, filter and group them. The kinds are a closed list,
`widgetSourceKinds`: `todos` (status, open, done, overdue, waiting, due date, priority, category)
and `notes` (title, pinned, updated date). A widget has no network access and no query language,
so it cannot reach outside the workspace or join across projects.

- **One rule, two feeds.** `widgetSourceRows(sources, records)`
  (`src/lib/services/widgets/sources.ts`) turns one project's todos and notes into rows. In the
  browser the records come from the synced workspace views (`widgetSources` in
  `src/lib/stores/widgets/widget-sources.svelte.ts`), so a dashboard works offline and follows
  every todo change as it syncs. Export reads the same records through the todo and note services
  and calls the same rule.
- **Sources are never saved.** `sources` is a reserved data key like `derived`. A change in the
  workspace re-renders the widget and is never a widget edit, so it cannot conflict or replay.
- **A view is told where its rows come from.** `WidgetView` takes a required `sources` value:
  rows, or `unavailable` when no workspace is loaded. An unavailable source shows a notice, and
  formulas over it fail loudly instead of counting zero.
- **Export shows the work as of the export**, with today as the server's UTC date.

### The library stays behind two seams

json-render is imported in two places only:

- `src/lib/services/widgets/`, for `validateSpec` inside the edit rule.
- `src/lib/components/widgets/`, for rendering. The registry maps each catalog component to a
  Svelte component built on our own `src/lib/components/ui/` primitives (ADR 0005). We do not use
  `@json-render/shadcn-svelte`.

Models define the stored layout and data schemas with Zod and do not import the library. The
versions are pinned exactly. A library upgrade changes two directories.

json-render wraps each rendered element in a `svelte:boundary` that only logs, so a component
that throws disappears instead of failing. The registry components must not throw; the
unsupported-element placeholder covers the one expected gap.

### Templates are drafts, and the picker previews them as saved

A template is a `WidgetDraft` in `widgetTemplates`: a checklist, a progress tracker, a decision
log, a status board, a savings simulator, a loan calculator, an expense tracker, a habit
tracker, a decision matrix and a project dashboard. The later six exist to show that the catalog
builds small tools: each combines inputs or a table with formulas and a chart, and the
dashboard reads workspace sources. The "Widget" command opens a picker that previews each template as
`createWidget` would save it, and also offers the project's existing widgets, because many notes
can show one widget.

### People edit a widget as JSON

The widget pane has an Edit mode with a title, the layout and the data as JSON. Typed text is
parsed at the browser edge (`src/lib/client/widgets/json-text.ts`). `widgetChangesBetween` turns
the edited content into the smallest changes, and the preview is those changes applied by
`applyWidgetChanges`, the same rule the server applies. The problems are listed with their JSON
Pointer paths, and Apply stays off while there are any. A widget needs no note: the gallery
starts a blank one.

### The view turns control changes into data changes

`WidgetView` gives json-render a controlled `createStateStore` seeded with the widget data, and
subscribes to it. In controlled mode the library ignores `onStateChange`, so the subscription is
the only reliable signal. On each change the view reads the store snapshot with
`widgetDataSchema`, computes the smallest patch with `diffWidgetData`, and hands one `data` change
to its owner. Controls write the store on every keystroke, so the view hands over one change per
pause of about 350 ms, and flushes on `pagehide`, when the page is hidden and when it unmounts.
The write to the queue is asynchronous and `pagehide` does not wait for it, so a reload inside
the pause lost the last edit. On `beforeunload` the view hands the edit over and, while it is
still being written, asks the browser to hold the page, as the note editor does. Ticking one checkbox produces one `replace` of that
item's flag. A record whose data differs from what the view last agreed with changed elsewhere,
by sync or an agent. The view writes the new values into the store key by key, so a control
keeps its focus. Without an edit handler the view is read-only.

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

`WidgetsController` exposes `synchronize`, `get`, `catalog`, `list`, `create`,
`edit(actor, input)`, `archive`, `restore` and `delete`. It
does not have one method for each kind of change. Workspace commands and agent tools map onto
these operations.

Agent tools stay separate for data and layout, so approval and evaluation can tell them apart (ADRs
0003 and 0023). Both are mutations and wait for approval when the run requires it. Strict tool
schemas cannot describe an arbitrary JSON value: Zod emits `oneOf` and an open
`additionalProperties`, and the tool boundary keeps only top-level properties. So the patch crosses
the tool boundary as a JSON string and is parsed there into a `JsonPatch`. `create_widget` takes
its layout and data the same way. The diagram tools take their source as a string for the same
reason.

The agent reads the catalog on demand with `read_widget_catalog` (ADR 0022). Its text comes from
`widgetCatalogPrompt`, generated from `widgetCatalog`, so it cannot describe a component, prop,
expression or action the rule would refuse. json-render's own `catalog.prompt()` is not used,
because it describes custom actions, `watch` and other features this catalog leaves out.

`create_widget` saves the widget in a project and returns the line that embeds it,
`:::widgetNode {widgetId="…"} :::`, with a typed next action to insert it with `edit_note`
(ADR 0035). `edit_note` keeps the note's own review. Creating and embedding stay two tools, so
each keeps one guard. A live run of the effect eval showed why the next action is needed: without
it, the agent created the widget and stopped. `list_widgets` finds a widget by title in a project
when no note names its id.

The approval card renders a widget proposal with the same rule: a created widget as `createWidget`
would save it, and an edited one before and after `applyWidgetEdit`. A proposal the rule would
refuse, including one made against an older revision, shows why before anyone approves it.

### Search indexes what a widget shows

A widget is a knowledge-index source of its own (`search_chunks.widget_id`, ADR 0019). Its text is
`widgetSearchText`: the title, text-like literal props, column and option labels, and the strings
in the data. Booleans and numbers are left out, so ticking a box changes no chunk and costs no
embedding. Production defers embedding to the worker (ADR 0021). A widget in the trash answers no
searches. The agent's `search` finds a widget by what it shows and gets its id; the notes search
panel is unchanged. A live eval showed why this matters: before it, an agent asked to tick an item
could not find the widget at all.

### Export prints what the widget showed

A note export writes each embedded widget as static blocks (`widgetExport`): a heading, checklist
items as ☑ and ☐, fields, metrics, progress, tables, badges and dividers, one arm per catalog
component. Expressions, repeats and `visible` are resolved against the saved data by a small
resolver over JSON values that covers exactly the allow-listed expressions, so export does not
depend on the library's untyped resolver. A horizontal row prints as one line. PDF and DOCX each
render the same blocks. A widget that is missing, in the trash or in another project stops the
export with a validation error, as a draw.io diagram does: an export that silently left it out
would misrepresent the note.

### What still needs a decision

- **Agent reliability for create-and-embed.** The effect eval
  `effect-widget-created-then-ticked` passed in 4 of 9 live runs on 2026-10-04, all made after widgets
  became searchable. Finding
  and ticking an embedded widget now succeeds in every run that created one. The failures are
  earlier: the agent sometimes stops after `create_widget` without the `edit_note` that embeds it,
  and once it never searched for the widget tools and wrote a Markdown checklist. Two directions
  are open: make the widget tools first-class (ADR 0022 weighs every first-class schema), or add a
  create-and-embed tool that goes through the reviewed note change (ADR 0003). Embedding from the
  widgets controller was rejected because it would bypass that review.
  The catalog version 3 eval `effect-widget-savings-simulator` sharpens this: in 3 of 3 live runs
  on 2026-10-04 the agent built a working simulator from one prompt, with inputs, formulas and a
  chart reaching the expected balance, and in 0 of 3 did it embed the widget in the note. Building
  is no longer the limit; embedding is.

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
  one `data` change, that a burst of typing becomes one change, a `visible` rule, the read-only
  view, and the unsupported-element placeholder. `edits.spec.ts` checks that every template is a
  valid draft.
- `src/lib/server/factories/agent/widget-tools.spec.ts` checks that `edit_widget_data` saves
  through the shared rule, that `create_widget` returns its embed line, that rejected edits and
  layouts name the problem, that `read_widget_catalog` returns the catalog, and that the tool
  parameters convert to strict JSON Schema.
- `src/lib/components/chat/actions/widget-approval-preview.spec.ts` checks the approval preview:
  before and after, a stale edit, a created widget, and a widget not yet on the device.
- `src/evals/cases/widgets.ts` asks the agent for twelve widgets, from the PR #299 examples to a
  grade calculator, a trip cost splitter and an OKR tracker. It also asks for six edits to
  existing widgets, one request that does not name widgets, and two requests that need no widget.
  A probe (`src/evals/assertions/widget/probe.ts`) uses each saved widget as a person would. It
  moves inputs, adds rows, ticks boxes and adds todos, and it compares the labelled values with
  closed-form results. `widget_build` is gated. `widget_embed` is reported only, until the
  create-and-embed question below is decided.
  `src/evals/fixtures/widgets/scenarios.spec.ts` shows that a hand-built reference widget
  passes each probe.
- `src/lib/services/widgets/search-text.spec.ts`, the indexing case in
  `widget-mutations.contract.spec.ts` and `src/lib/server/services/knowledge-search/semantic.spec.ts`
  check the search text, the stored chunks and the widget source.
- `src/lib/services/widgets/export-blocks.spec.ts` and
  `src/lib/server/controllers/deliverables/export-widgets.spec.ts` check the export blocks, the
  DOCX text, and the refusal for a widget in the trash.
- `src/lib/services/widgets/trash.spec.ts` checks the trash rules, the lifecycle cases in
  `widget-mutations.contract.spec.ts` check them on Postgres, and
  `src/lib/controllers/workspace/archived-collections.spec.ts` checks that an archived project
  hides its widgets.
- `src/lib/stores/workbench/tab-ref.spec.ts`, `workbench-url.spec.ts` and
  `src/lib/stores/agent/app-context.svelte.node.spec.ts` check the `widget:` tab, its URL and
  the agent surface.
- `tests/e2e/widgets.e2e.ts` creates a widget from a note, ticks it, reloads, and edits it in its
  tab. A second case moves it to the trash from the gallery, sees the note show it as trashed, and
  restores it. A third inserts a status board from the picker and saves a chosen status. A fourth
  starts a blank widget in the gallery, reshapes it in the JSON editor, and keeps it.
- `src/lib/services/widgets/formulas.spec.ts` and `src/lib/models/widget-formulas/index.spec.ts`
  check the formula language, its failures, the step budget, and that every template works its
  formulas out; the savings and loan templates are checked against the closed-form results.
  `sources.spec.ts` checks the source rows, `widget-view.svelte.spec.ts` the live formulas,
  charts, sliders, the data table and sources, and the sync contract stores formulas and
  rejects a circular pair.
- `tests/e2e/widgets.e2e.ts` also moves a savings simulator's inputs and reloads, adds and
  totals an expense row and reloads, and counts a todo added elsewhere on a project dashboard.
- `src/lib/components/widgets/widget-json-editor.svelte.spec.ts` and
  `src/lib/client/widgets/json-text.spec.ts` check the editor's problems and the changes it
  applies.
