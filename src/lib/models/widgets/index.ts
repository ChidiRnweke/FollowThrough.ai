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

const stateReferenceSchema = z.strictObject({ $state: pointerSchema });

/** json-render's comparison operators, exactly: equality on any value, order on numbers. */
const comparisonOperators = {
	eq: jsonValueSchema.optional(),
	neq: jsonValueSchema.optional(),
	gt: z.union([z.number(), stateReferenceSchema]).optional(),
	gte: z.union([z.number(), stateReferenceSchema]).optional(),
	lt: z.union([z.number(), stateReferenceSchema]).optional(),
	lte: z.union([z.number(), stateReferenceSchema]).optional(),
	not: z.literal(true).optional()
};

const singleConditionSchema = z.union([
	z.strictObject({ $state: pointerSchema, ...comparisonOperators }),
	z.strictObject({ $item: z.string(), ...comparisonOperators }),
	z.strictObject({ $index: z.literal(true), ...comparisonOperators })
]);

type SingleCondition = z.infer<typeof singleConditionSchema>;

/** When an element shows: a constant, one condition, all of a list, or `$and`/`$or` groups. */
export type WidgetVisibility =
	| boolean
	| SingleCondition
	| SingleCondition[]
	| { $and: WidgetVisibility[] }
	| { $or: WidgetVisibility[] };

export const widgetVisibilitySchema: z.ZodType<WidgetVisibility> = z.lazy(() =>
	z.union([
		z.boolean(),
		singleConditionSchema,
		z.array(singleConditionSchema),
		z.strictObject({ $and: z.array(widgetVisibilitySchema) }),
		z.strictObject({ $or: z.array(widgetVisibilitySchema) })
	])
);

/**
 * One element of a layout. `watch` is left out: nothing needs it yet, and anything absent here is
 * rejected rather than stored unchecked.
 */
export const widgetElementSchema = z.strictObject({
	type: z.string().min(1),
	props: z.record(z.string(), jsonValueSchema),
	children: z.array(elementKeySchema),
	visible: widgetVisibilitySchema.optional(),
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
	version: 2,
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
		TextInput: {
			description: 'A labelled text field. Bind `value` to state to save what is typed.',
			props: z.strictObject({
				label: dynamic(z.string()),
				value: dynamic(z.string()),
				placeholder: dynamic(z.string()).nullish()
			}),
			slots: []
		},
		NumberInput: {
			description: 'A labelled number field. Bind `value` to state to save the number.',
			props: z.strictObject({
				label: dynamic(z.string()),
				value: dynamic(z.number()),
				min: z.number().nullish(),
				max: z.number().nullish(),
				step: z.number().positive().nullish()
			}),
			slots: []
		},
		Select: {
			description: 'A choice from fixed options. Bind `value` to state to save the choice.',
			props: z.strictObject({
				label: dynamic(z.string()).nullish(),
				value: dynamic(z.string()),
				options: z
					.array(z.strictObject({ value: z.string().min(1), label: z.string().min(1) }))
					.min(1)
			}),
			slots: []
		},
		Table: {
			description: 'Rows of a state array under named columns. Each column reads one row field.',
			props: z.strictObject({
				columns: z.array(z.strictObject({ key: z.string().min(1), label: z.string() })).min(1),
				rows: dynamic(z.array(z.record(z.string(), jsonValueSchema))),
				empty: z.string().nullish()
			}),
			slots: []
		},
		Badge: {
			description: 'A short status label. The tone colours it; the text always says the status.',
			props: z.strictObject({
				text: dynamic(z.string()),
				tone: z.enum(['neutral', 'brand', 'success', 'warning', 'danger']).nullish()
			}),
			slots: []
		},
		Divider: {
			description: 'A horizontal rule between groups.',
			props: z.strictObject({}),
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
	},
	progress: {
		title: 'Progress tracker',
		layout: {
			root: 'card',
			elements: {
				card: {
					type: 'Card',
					props: { title: { $state: '/title' } },
					children: ['progress', 'numbers', 'note']
				},
				progress: {
					type: 'Progress',
					props: { label: 'Done', value: { $state: '/done' }, max: { $state: '/total' } },
					children: []
				},
				numbers: {
					type: 'Stack',
					props: { direction: 'horizontal', gap: 'lg' },
					children: ['done', 'total']
				},
				done: {
					type: 'NumberInput',
					props: { label: 'Done', value: { $bindState: '/done' }, min: 0 },
					children: []
				},
				total: {
					type: 'NumberInput',
					props: { label: 'Target', value: { $bindState: '/total' }, min: 1 },
					children: []
				},
				note: {
					type: 'TextInput',
					props: {
						label: 'Note',
						value: { $bindState: '/note' },
						placeholder: 'What is in the way?'
					},
					children: []
				}
			}
		},
		data: { title: 'Progress tracker', done: 3, total: 10, note: '' }
	},
	decisions: {
		title: 'Decision log',
		layout: {
			root: 'card',
			elements: {
				card: { type: 'Card', props: { title: { $state: '/title' } }, children: ['table'] },
				table: {
					type: 'Table',
					props: {
						columns: [
							{ key: 'decision', label: 'Decision' },
							{ key: 'owner', label: 'Owner' },
							{ key: 'date', label: 'Date' }
						],
						rows: { $state: '/decisions' },
						empty: 'No decisions yet.'
					},
					children: []
				}
			}
		},
		data: {
			title: 'Decision log',
			decisions: [{ decision: 'First decision', owner: 'Owner', date: '2026-10-01' }]
		}
	},
	status: {
		title: 'Status board',
		layout: {
			root: 'card',
			elements: {
				card: { type: 'Card', props: { title: { $state: '/title' } }, children: ['rows'] },
				rows: {
					type: 'Stack',
					props: { direction: 'vertical', gap: 'sm' },
					repeat: { statePath: '/workstreams', key: 'id' },
					children: ['row']
				},
				row: {
					type: 'Stack',
					props: { direction: 'horizontal', gap: 'md' },
					children: ['name', 'status', 'flag']
				},
				name: { type: 'Text', props: { text: { $item: 'name' } }, children: [] },
				status: {
					type: 'Select',
					props: {
						label: { $item: 'name' },
						value: { $bindItem: 'status' },
						options: [
							{ value: 'on_track', label: 'On track' },
							{ value: 'at_risk', label: 'At risk' },
							{ value: 'blocked', label: 'Blocked' },
							{ value: 'done', label: 'Done' }
						]
					},
					children: []
				},
				flag: {
					type: 'Badge',
					props: { text: 'Needs attention', tone: 'warning' },
					visible: { $item: 'status', eq: 'blocked' },
					children: []
				}
			}
		},
		data: {
			title: 'Status board',
			workstreams: [
				{ id: 'design', name: 'Design', status: 'on_track' },
				{ id: 'build', name: 'Build', status: 'at_risk' },
				{ id: 'launch', name: 'Launch', status: 'blocked' }
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
