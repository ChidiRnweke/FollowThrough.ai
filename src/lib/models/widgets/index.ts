import { z } from 'zod';
type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

type DateTime = Brand<string, 'DateTime'>;

export type WidgetId = Brand<string, 'WidgetId'>;

const jsonValueSchema = z.json();

/** Any JSON value. Widget data and literal props are JSON, so they survive storage and sync. */
export type JsonValue = z.infer<typeof jsonValueSchema>;

/** An RFC 6901 pointer: empty for the whole document, otherwise `/`-prefixed segments. */
const pointerSchema = z.string().regex(/^(\/[^/]*)*$/, 'Expected a JSON Pointer such as /items/0');

const elementKeySchema = z
	.string()
	.min(1)
	.max(120)
	.regex(/^[A-Za-z0-9_-]+$/, 'Element keys use letters, digits, - and _');

/**
 * The prop expressions a layout may use. Anything else in a prop is a literal and must match
 * the component's schema, so this list is part of the allow-list in ADR 0043.
 */
export const propExpressionSchema = z.union([
	z.strictObject({ $state: pointerSchema }),
	z.strictObject({ $bindState: pointerSchema }),
	z.strictObject({ $item: z.string() }),
	z.strictObject({ $bindItem: z.string().min(1) }),
	z.strictObject({ $index: z.literal(true) }),
	z.strictObject({ $template: z.string() })
]);

/** A prop that is either a literal of `schema` or a state expression. */
const dynamic = <T extends z.ZodType>(schema: T) => z.union([schema, propExpressionSchema]);

/** Version 1 allows only the renderer's built-in state actions: none of them leaves the widget. */
export const widgetActions = ['setState', 'pushState', 'removeState', 'validateForm'] as const;

const actionBindingSchema = z.strictObject({
	action: z.enum(widgetActions),
	params: z.record(z.string(), jsonValueSchema).optional()
});

/**
 * One element of a layout. Version 1 leaves out json-render's `visible` and `watch`: neither is
 * needed yet, and anything absent here is rejected rather than stored unchecked.
 */
export const widgetElementSchema = z.strictObject({
	type: z.string().min(1),
	props: z.record(z.string(), jsonValueSchema),
	children: z.array(elementKeySchema),
	repeat: z
		.strictObject({ statePath: pointerSchema, key: z.string().min(1).optional() })
		.optional(),
	on: z.record(z.string(), z.union([actionBindingSchema, z.array(actionBindingSchema)])).optional()
});

export type WidgetElement = z.infer<typeof widgetElementSchema>;

/** The structure of a widget: the json-render spec without its `state`. */
export const widgetLayoutSchema = z.strictObject({
	root: elementKeySchema,
	elements: z.record(elementKeySchema, widgetElementSchema)
});

export type WidgetLayout = z.infer<typeof widgetLayoutSchema>;

/** The data of a widget: the json-render state, always an object at the top. */
export const widgetDataSchema = z.record(z.string(), jsonValueSchema);

export type WidgetData = z.infer<typeof widgetDataSchema>;

export const jsonPatchOperationSchema = z.discriminatedUnion('op', [
	z.strictObject({ op: z.literal('add'), path: pointerSchema, value: jsonValueSchema }),
	z.strictObject({ op: z.literal('replace'), path: pointerSchema, value: jsonValueSchema }),
	z.strictObject({ op: z.literal('test'), path: pointerSchema, value: jsonValueSchema }),
	z.strictObject({ op: z.literal('remove'), path: pointerSchema }),
	z.strictObject({ op: z.literal('move'), from: pointerSchema, path: pointerSchema }),
	z.strictObject({ op: z.literal('copy'), from: pointerSchema, path: pointerSchema })
]);

export type JsonPatchOperation = z.infer<typeof jsonPatchOperationSchema>;

/** An RFC 6902 patch. Every edit to a widget part is one. */
export const jsonPatchSchema = z.array(jsonPatchOperationSchema).min(1);

export type JsonPatch = z.infer<typeof jsonPatchSchema>;

const widgetTitleSchema = z.string().trim().min(1).max(200);

/** A request to create a widget. A template is one of these. */
export const widgetDraftSchema = z.strictObject({
	title: widgetTitleSchema,
	layout: widgetLayoutSchema,
	data: widgetDataSchema
});

export type WidgetDraft = z.infer<typeof widgetDraftSchema>;

/**
 * What a change does to a widget, without the revision it was made against. The workspace queue
 * sends this: its base version and the ADR 0042 replay guard it, so a change replayed onto a newer
 * widget still applies.
 */
export const widgetChangeSchema = z.discriminatedUnion('kind', [
	z.strictObject({ kind: z.literal('data'), patch: jsonPatchSchema }),
	z.strictObject({ kind: z.literal('layout'), patch: jsonPatchSchema }),
	z.strictObject({ kind: z.literal('rename'), title: widgetTitleSchema })
]);

export type WidgetChange = z.infer<typeof widgetChangeSchema>;

/**
 * A change guarded by the revision of the part it touches. Agent tools send this: they write on
 * the server, where no queue base exists, so the revision is their only guard (ADR 0043).
 */
export const widgetEditSchema = z.discriminatedUnion('kind', [
	z.strictObject({
		kind: z.literal('data'),
		patch: jsonPatchSchema,
		expectedDataRevision: z.number().int().positive()
	}),
	z.strictObject({
		kind: z.literal('layout'),
		patch: jsonPatchSchema,
		expectedLayoutRevision: z.number().int().positive()
	}),
	z.strictObject({ kind: z.literal('rename'), title: widgetTitleSchema })
]);

export type WidgetEdit = z.infer<typeof widgetEditSchema>;

/** A saved widget. Layout and data change independently, so each has its own revision. */
export interface Widget {
	readonly id: WidgetId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	/** The note the widget was created in. Other notes may embed it too. */
	readonly sourceNoteId?: NoteId;
	readonly title: string;
	readonly catalogVersion: number;
	readonly layout: WidgetLayout;
	readonly layoutRevision: number;
	readonly data: WidgetData;
	readonly dataRevision: number;
	readonly archivedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

/** Facts a new widget needs that its draft cannot supply. */
export interface WidgetCreation {
	readonly id: WidgetId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly sourceNoteId?: NoteId;
	readonly now: DateTime;
}

/** Where a problem is (`/elements/card/props/title`, `/data/items`) and what it is. */
export interface WidgetIssue {
	readonly path: string;
	readonly message: string;
}

export type WidgetPart = 'data' | 'layout';

export type WidgetEditResult =
	| { readonly kind: 'applied'; readonly widget: Widget }
	| { readonly kind: 'invalid'; readonly issues: readonly WidgetIssue[] }
	| { readonly kind: 'stale'; readonly part: WidgetPart; readonly currentRevision: number };

export interface WidgetComponentDefinition {
	readonly description: string;
	readonly props: z.ZodObject;
	/** Components with a `default` slot render their children; the rest are leaves. */
	readonly slots: readonly 'default'[];
}

export interface WidgetCatalog {
	readonly version: number;
	readonly components: Readonly<Record<string, WidgetComponentDefinition>>;
}

const tone = z.enum(['default', 'muted']).nullish();

/** The allow-list of components a layout may use. A layout naming anything else is invalid. */
export const widgetCatalog = {
	version: 1,
	components: {
		Stack: {
			description: 'Lays out its children vertically or horizontally.',
			props: z.strictObject({
				direction: z.enum(['vertical', 'horizontal']).nullish(),
				gap: z.enum(['sm', 'md', 'lg']).nullish()
			}),
			slots: ['default']
		},
		Card: {
			description: 'A bordered container with an optional title and description.',
			props: z.strictObject({
				title: dynamic(z.string()).nullish(),
				description: dynamic(z.string()).nullish()
			}),
			slots: ['default']
		},
		Heading: {
			description: 'A section heading.',
			props: z.strictObject({
				text: dynamic(z.string()),
				level: z.union([z.literal(2), z.literal(3), z.literal(4)]).nullish()
			}),
			slots: []
		},
		Text: {
			description: 'A paragraph of text.',
			props: z.strictObject({ text: dynamic(z.string()), tone }),
			slots: []
		},
		Checkbox: {
			description: 'A labelled checkbox. Bind `checked` to state to save the choice.',
			props: z.strictObject({ label: dynamic(z.string()), checked: dynamic(z.boolean()) }),
			slots: []
		},
		Progress: {
			description: 'A progress bar from 0 to `max`.',
			props: z.strictObject({
				label: dynamic(z.string()).nullish(),
				value: dynamic(z.number().min(0)),
				max: dynamic(z.number().positive())
			}),
			slots: []
		},
		Metric: {
			description: 'A labelled number or short value, with an optional detail line.',
			props: z.strictObject({
				label: dynamic(z.string()),
				value: dynamic(z.union([z.string(), z.number()])),
				detail: dynamic(z.string()).nullish(),
				tone
			}),
			slots: []
		}
	}
} as const satisfies WidgetCatalog;

export type WidgetComponentName = keyof typeof widgetCatalog.components;

/** Starting points for a new widget. Each is an ordinary draft. */
export const widgetTemplates = {
	checklist: {
		title: 'Checklist',
		layout: {
			root: 'card',
			elements: {
				card: { type: 'Card', props: { title: { $state: '/title' } }, children: ['items'] },
				items: {
					type: 'Stack',
					props: { direction: 'vertical', gap: 'sm' },
					repeat: { statePath: '/items', key: 'id' },
					children: ['item']
				},
				item: {
					type: 'Checkbox',
					props: { label: { $item: 'label' }, checked: { $bindItem: 'done' } },
					children: []
				}
			}
		},
		data: {
			title: 'Checklist',
			items: [
				{ id: 'first', label: 'First step', done: false },
				{ id: 'second', label: 'Second step', done: false },
				{ id: 'third', label: 'Third step', done: false }
			]
		}
	}
} as const satisfies Record<string, WidgetDraft>;

export type WidgetTemplateName = keyof typeof widgetTemplates;

/** Create a widget. The caller chooses the id, so a retried create cannot make two. */
export interface CreateWidgetInput {
	readonly id: WidgetId;
	readonly projectId: ProjectId;
	readonly sourceNoteId?: NoteId;
	readonly draft: WidgetDraft;
}

export interface EditWidgetInput {
	readonly widgetId: WidgetId;
	readonly edit: WidgetEdit;
}
