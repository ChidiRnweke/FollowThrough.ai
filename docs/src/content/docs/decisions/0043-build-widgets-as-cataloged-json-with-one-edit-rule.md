---
title: 'ADR 0043: Build widgets as cataloged JSON with one edit rule'
description: Every widget change, from a person, a template or an agent, is one typed edit that one shared rule applies.
---

## Status

Proposed. This decision sets the seams that the widget implementation must fit before the
implementation exists. It becomes Accepted when the widget table and its rendering are in
`master`. It will be revised as the open questions below are answered. The research behind it is
in `docs/plans/widget-system-json-render-spike.md`.

## Context

A widget is a small structured user interface, such as a checklist, a metric row or a table, that
is declared as data instead of code. A note can embed a widget. A widget can also open in its own
tab. People create widgets from templates or by hand, and they change widget data through the
widget, for example by ticking a checkbox. Agents create widgets and change both their data and
their structure. Widgets are stored in PostgreSQL and are edited offline like other workspace
records (ADR 0040).

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
holds only `diagramId`. Many notes can embed one widget, and the widget opens in a `widget:<id>`
tab and at `/widgets/<id>`.

The resolved widget has two independent parts. Each part has its own revision:

```ts
interface Widget {
	readonly id: WidgetId;
	readonly projectId: ProjectId;
	readonly title: string;
	readonly catalogVersion: CatalogVersion;
	readonly layout: WidgetLayout; // the json-render spec without `state`
	readonly layoutRevision: number;
	readonly data: WidgetData; // the json-render state: a JSON value
	readonly dataRevision: number;
}
```

`layout` and `data` are our domain terms. The json-render terms `spec` and `state` appear only
where the library is called. Layout changes are rare and deliberate. Data changes are frequent and
small. Separate revisions let a person tick a checkbox while an agent changes the layout, and
neither write is stale.

A request to create a widget is a separate type, `WidgetDraft`, with no id and no revisions. A
template is a `WidgetDraft` value. Creation by hand, by template and by an agent produce the same
draft.

### Every change is one `WidgetEdit` value

All changes to an existing widget are expressed as one discriminated union:

```ts
type WidgetEdit =
	| { readonly kind: 'data'; readonly patch: JsonPatch; readonly expectedDataRevision: number }
	| { readonly kind: 'layout'; readonly patch: JsonPatch; readonly expectedLayoutRevision: number }
	| { readonly kind: 'rename'; readonly title: string };
```

`JsonPatch` is an RFC 6902 operation list. Each source does one job, which is to translate its
input into a `WidgetEdit`:

| Source                 | Produces                                            |
| ---------------------- | --------------------------------------------------- |
| A bound widget control | `data`, from the state store bridge                 |
| The manual JSON editor | `data` or `layout`, from a diff of the edited value |
| `edit_widget_data`     | `data`, from the tool arguments                     |
| `edit_widget_layout`   | `layout`, from the tool arguments                   |
| Offline replay         | the queued `WidgetEdit`, unchanged                  |

No source validates, merges or saves a widget by itself.

### One rule applies an edit

One shared service, `src/lib/services/widgets/edits.ts`, owns the meaning of an edit (ADR 0041):

```ts
type WidgetEditResult =
	| { readonly kind: 'applied'; readonly widget: Widget }
	| { readonly kind: 'invalid'; readonly issues: readonly WidgetIssue[] }
	| { readonly kind: 'stale'; readonly part: 'data' | 'layout' };

applyWidgetEdit(widget: Widget, edit: WidgetEdit, catalog: WidgetCatalog): WidgetEditResult;
```

The function is total and does no I/O. It checks the revision of the part that the edit touches,
applies the patch, and validates the result against the catalog. Creation uses the matching rule
`createWidget(draft, catalog)`. Every consumer calls these rules:

- The browser calls them to show the optimistic result before it queues the edit.
- The server calls them again with the current saved widget before it writes.
- The agent approval preview calls them to render the widget as it will be after approval.
- The manual editor calls them while the user types, to show the issues.

Failures are values. `invalid` carries the issues that an agent tool returns as a recoverable
validation failure, and that the editor shows next to the JSON. `stale` is a conflict in the sense
of ADR 0010.

### The catalog is the allow-list

`WidgetCatalog` is a versioned value in `src/lib/models/widgets/`: component names, Zod prop
schemas and descriptions. A layout can use only cataloged components. Version 1 permits only the
json-render built-in state actions (`setState`, `pushState`, `removeState`, `validateForm`). It
has no custom actions that do I/O, and no component that takes free-form URLs, HTML or frames.
Agents write layouts, so a layout is untrusted input.

A stored layout records its `catalogVersion`. When a layout names a component that the current
catalog does not have, the renderer shows a visible unsupported-element placeholder. The stored
element is kept (ADR 0015).

### The library stays behind two seams

json-render is imported in two places only:

- `src/lib/services/widgets/`, for spec validation inside `applyWidgetEdit` and `createWidget`.
- `src/lib/components/widgets/`, for rendering. The registry maps each catalog component to a
  snippet built on our own `src/lib/components/ui/` primitives (ADR 0005). We do not use
  `@json-render/shadcn-svelte`.

Models define the stored layout and data schemas with Zod and do not import the library. The
versions are pinned exactly. A library upgrade then changes two directories.

### Boundaries parse, the inside is total

The DB mapper parses `layout` with the model schema and `data` with `z.json()` (ADR 0037). A list
read returns an unreadable result for each bad row, and a single read fails. Agent tool arguments
and remote inputs are parsed into `WidgetEdit` and `WidgetDraft` at their boundaries. Services and
controllers receive only resolved values.

### The controller has one edit operation

`WidgetsController` exposes `create`, `get`, `list`, `edit(actor, widgetId, edit)` and `archive`.
It does not have one method for each kind of change. Remotes, workspace commands and agent tools
map onto these operations. Agent tools stay separate for data and layout, so approval and
evaluation can tell them apart (ADRs 0003 and 0023). The catalog prompt reaches the agent through a
read tool on demand (ADR 0022).

### Open questions

These parts are deliberately not decided. An implementation must not guess them. The slice named
in each item answers it and revises this record.

- **Tool argument format.** Agent tools use strict JSON Schema, which cannot describe an arbitrary
  JSON value. Patch values and drafts will probably be sent as JSON strings and parsed at the tool
  boundary. Decided by the agent tools slice.
- **Data merge granularity.** The ADR 0042 replay merges by field. If `data` is one field, two
  offline edits to different keys in one widget need review. The widget replay function could
  merge `data` by JSON Pointer path instead. Decided by the sync slice.
- **State store bridge.** It is not verified that the Svelte `StateProvider` accepts a controlled
  external store. Decided by the rendering slice.
- **Patch implementation.** The applier for data patches: from json-render or our own. Decided by
  the rendering slice.
- **Layout history.** Whether layout revisions are kept for restore (ADR 0011). Data history is
  not kept.

## Consequences

- Five sources of change share one validation, one revision check and one failure vocabulary.
- An agent cannot save a layout that the catalog rejects, and the approval preview shows the same
  result that the server will save.
- A data edit and a layout edit to one widget do not conflict.
- A new source of change only translates its input into a `WidgetEdit`.
- A new kind of change adds an arm to `WidgetEdit` and a case to `applyWidgetEdit`. The type
  checker finds every consumer that must handle it.
- The catalog limits what widgets can show. A new component needs a catalog entry and a registry
  snippet.
- json-render upgrades are confined to two directories but can still break those directories,
  because the library is pre-1.0.

## Evidence

Pending. This section will name the specs that hold each guarantee as the implementation lands:
that every source produces a `WidgetEdit`, that browser and server apply it through
`applyWidgetEdit`, and that the catalog rejects uncataloged components.
