import { z } from 'zod';
import { formulaSourceSchema, parseFormula } from '$lib/models/widget-formulas';
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

/**
 * Top-level state keys the widget computes rather than stores. A renderer reads them like data,
 * through `$state`, but no control writes them and they are never saved.
 */
export const widgetComputedRoots = ['derived'] as const;

const derivedNameSchema = z
	.string()
	.regex(/^[A-Za-z][A-Za-z0-9_]{0,59}$/, 'Derived names start with a letter: letters, digits, _');

const DERIVED_PREFIX = '/derived/';

/** The derived values a formula reads, by name. `@/derived/total/0` reads `total`. */
const derivedReads = (references: readonly string[]): readonly string[] =>
	references.flatMap((pointer) =>
		pointer.startsWith(DERIVED_PREFIX) ? [pointer.slice(DERIVED_PREFIX.length).split('/')[0]!] : []
	);

/** The first chain of derived values that reads itself, if any. */
const derivedCycle = (
	reads: ReadonlyMap<string, readonly string[]>
): readonly string[] | undefined => {
	const visit = (name: string, path: readonly string[]): readonly string[] | undefined => {
		if (path.includes(name)) return [...path.slice(path.indexOf(name)), name];
		for (const next of reads.get(name) ?? []) {
			const cycle = visit(next, [...path, name]);
			if (cycle) return cycle;
		}
		return undefined;
	};
	for (const name of reads.keys()) {
		const cycle = visit(name, []);
		if (cycle) return cycle;
	}
	return undefined;
};

/** A pointer into a computed root, which a control must not write. */
const isComputedPointer = (pointer: string) =>
	widgetComputedRoots.some((root) => pointer === `/${root}` || pointer.startsWith(`/${root}/`));

/** The structure of a widget: the json-render spec without its `state`, plus its formulas. */
export const widgetLayoutSchema = z
	.strictObject({
		root: elementKeySchema,
		elements: z.record(elementKeySchema, widgetElementSchema),
		/** Named formulas. Each result is read at `/derived/<name>`. */
		derived: z.record(derivedNameSchema, formulaSourceSchema).optional()
	})
	.superRefine((layout, context) => {
		const derived = layout.derived ?? {};
		const reads = new Map(
			Object.entries(derived).map(([name, source]) => {
				const parsed = parseFormula(source);
				return [name, parsed.kind === 'parsed' ? derivedReads(parsed.references) : []];
			})
		);
		for (const [name, names] of reads)
			for (const missing of names.filter((read) => !Object.hasOwn(derived, read)))
				context.addIssue({
					code: 'custom',
					path: ['derived', name],
					message: `@/derived/${missing} is not defined`
				});
		const cycle = derivedCycle(reads);
		if (cycle)
			context.addIssue({
				code: 'custom',
				path: ['derived', cycle[0]!],
				message: `These formulas read each other: ${cycle.join(' → ')}`
			});
		for (const [key, element] of Object.entries(layout.elements))
			for (const [prop, value] of Object.entries(element.props))
				if (
					typeof value === 'object' &&
					value !== null &&
					!Array.isArray(value) &&
					typeof value.$bindState === 'string' &&
					isComputedPointer(value.$bindState)
				)
					context.addIssue({
						code: 'custom',
						path: ['elements', key, 'props', prop],
						message: 'A computed value can be read with $state but not bound'
					});
		for (const [key, element] of Object.entries(layout.elements))
			for (const [event, bound] of Object.entries(element.on ?? {}))
				for (const [index, binding] of (Array.isArray(bound) ? bound : [bound]).entries())
					for (const param of ['statePath', 'clearStatePath'])
						if (
							typeof binding.params?.[param] === 'string' &&
							isComputedPointer(binding.params[param])
						)
							context.addIssue({
								code: 'custom',
								path: [
									'elements',
									key,
									'on',
									event,
									...(Array.isArray(bound) ? [index] : []),
									'params',
									param
								],
								message: 'An action cannot write a computed value'
							});
	});

export type WidgetLayout = z.infer<typeof widgetLayoutSchema>;

/** The data of a widget: the json-render state, always an object at the top. */
export const widgetDataSchema = z
	.record(z.string(), jsonValueSchema)
	.superRefine((data, context) => {
		for (const root of widgetComputedRoots)
			if (Object.hasOwn(data, root))
				context.addIssue({
					code: 'custom',
					path: [root],
					message: `"${root}" is reserved for computed values`
				});
	});

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
	// Layout and data that only make sense together, such as a new list and the array it shows.
	// Checked once, after both patches, so neither half has to be valid on its own.
	z.strictObject({ kind: z.literal('parts'), layout: jsonPatchSchema, data: jsonPatchSchema }),
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

/**
 * What a chart plots: one row per point, `x` naming the field along the bottom and each series
 * naming a numeric field. Keys become CSS colour variables, so they stay plain identifiers.
 */
const chartProps = {
	title: dynamic(z.string()).nullish(),
	rows: dynamic(z.array(z.record(z.string(), jsonValueSchema))),
	x: z.string().min(1),
	series: z
		.array(
			z.strictObject({
				key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Series keys are plain field names'),
				label: z.string().min(1)
			})
		)
		.min(1)
		.max(5),
	height: z.enum(['sm', 'md', 'lg']).nullish()
};

export type WidgetChartSeries = z.infer<typeof chartProps.series>[number];

const optionsSchema = z
	.array(z.strictObject({ value: z.string().min(1), label: z.string().min(1) }))
	.min(1);

/** A column a person edits in place. What it holds decides the control in each cell. */
const dataTableColumnSchema = z.discriminatedUnion('kind', [
	z.strictObject({ key: z.string().min(1), label: z.string(), kind: z.literal('text') }),
	z.strictObject({ key: z.string().min(1), label: z.string(), kind: z.literal('number') }),
	z.strictObject({ key: z.string().min(1), label: z.string(), kind: z.literal('checkbox') }),
	z.strictObject({
		key: z.string().min(1),
		label: z.string(),
		kind: z.literal('select'),
		options: optionsSchema
	})
]);

export type WidgetDataTableColumn = z.infer<typeof dataTableColumnSchema>;

/** The allow-list of components a layout may use. A layout naming anything else is invalid. */
export const widgetCatalog = {
	version: 3,
	components: {
		Stack: {
			description: 'Lays out its children vertically or horizontally.',
			props: z.strictObject({
				direction: z.enum(['vertical', 'horizontal']).nullish(),
				gap: z.enum(['sm', 'md', 'lg']).nullish()
			}),
			slots: ['default']
		},
		Grid: {
			description:
				'Lays out its children in columns, such as a row of metric cards on a dashboard. Columns fall back to one as the widget narrows.',
			props: z.strictObject({
				columns: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
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
		Slider: {
			description:
				'A labelled slider between `min` and `max`. Bind `value` to state; the current value shows beside the label, followed by `suffix` (such as `%`).',
			props: z.strictObject({
				label: dynamic(z.string()),
				value: dynamic(z.number()),
				min: z.number(),
				max: z.number(),
				step: z.number().positive().nullish(),
				suffix: z.string().max(12).nullish()
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
		DataTable: {
			description:
				'Rows a person edits in place. Bind `rows` with `$bindState` to an array of records. Each column has a `kind`: `text`, `number`, `checkbox`, or `select` with `options`. `addLabel` shows a button that adds an empty row; `removable` lets a row be removed. `footer` reads a record of values per column key, usually a derived `{ amount: sum(map(@/rows, item.amount)) }`.',
			props: z.strictObject({
				rows: dynamic(z.array(z.record(z.string(), jsonValueSchema))),
				columns: z.array(dataTableColumnSchema).min(1),
				addLabel: z.string().min(1).nullish(),
				removable: z.boolean().nullish(),
				footer: dynamic(
					z.record(z.string(), z.union([z.string(), z.number(), z.null()]))
				).nullish(),
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
		Button: {
			description:
				'A button. Bind `on.press` to `pushState` (add a list item; `"$id"` makes its id, `clearStatePath` empties the input it came from), `removeState` (remove the item at `{ "$index": true }`) or `setState`.',
			props: z.strictObject({
				label: dynamic(z.string()),
				variant: z.enum(['default', 'outline', 'ghost', 'destructive']).nullish(),
				disabled: dynamic(z.boolean()).nullish()
			}),
			slots: []
		},
		LineChart: {
			description:
				'Lines through rows of numbers, such as a balance by year. Read `rows` from state, often a derived `series(...)`; `x` names the field along the bottom; each series names a numeric field. Up to five series.',
			props: z.strictObject(chartProps),
			slots: []
		},
		AreaChart: {
			description:
				'Like LineChart, with the area under each line filled. `stacked: true` stacks the series, such as deposits under interest.',
			props: z.strictObject({ ...chartProps, stacked: z.boolean().nullish() }),
			slots: []
		},
		BarChart: {
			description:
				'Bars per row, such as spending by category. `x` is usually a text field. `stacked: true` stacks the series in one bar.',
			props: z.strictObject({ ...chartProps, stacked: z.boolean().nullish() }),
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
				card: {
					type: 'Card',
					props: { title: { $state: '/title' } },
					children: ['items', 'add']
				},
				add: {
					type: 'Stack',
					props: { direction: 'horizontal', gap: 'sm' },
					children: ['draft', 'addButton']
				},
				draft: {
					type: 'TextInput',
					props: { label: 'New item', value: { $bindState: '/draft' }, placeholder: 'Add a step' },
					children: []
				},
				addButton: {
					type: 'Button',
					props: { label: 'Add', variant: 'outline', disabled: { $state: '/derived/draftEmpty' } },
					on: {
						press: {
							action: 'pushState',
							params: {
								statePath: '/items',
								value: { id: '$id', label: { $state: '/draft' }, done: false },
								clearStatePath: '/draft'
							}
						}
					},
					children: []
				},
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
			},
			derived: { draftEmpty: '@/draft == ""' }
		},
		data: {
			title: 'Checklist',
			draft: '',
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
	},
	savings: {
		title: 'Savings simulator',
		layout: {
			root: 'card',
			elements: {
				card: {
					type: 'Card',
					props: {
						title: { $state: '/title' },
						description: 'Interest compounds monthly; deposits are made at the end of each month.'
					},
					children: ['inputs', 'sliders', 'results', 'chart', 'table']
				},
				chart: {
					type: 'AreaChart',
					props: {
						title: 'Balance by year',
						rows: { $state: '/derived/schedule' },
						x: 'year',
						series: [
							{ key: 'deposited', label: 'Deposited' },
							{ key: 'interest', label: 'Interest' }
						],
						stacked: true
					},
					children: []
				},
				inputs: {
					type: 'Stack',
					props: { direction: 'horizontal', gap: 'md' },
					children: ['start', 'monthly']
				},
				sliders: {
					type: 'Grid',
					props: { columns: 2, gap: 'lg' },
					children: ['rate', 'years']
				},
				start: {
					type: 'NumberInput',
					props: { label: 'Starting amount', value: { $bindState: '/start' }, min: 0, step: 100 },
					children: []
				},
				monthly: {
					type: 'NumberInput',
					props: { label: 'Monthly deposit', value: { $bindState: '/monthly' }, min: 0, step: 10 },
					children: []
				},
				rate: {
					type: 'Slider',
					props: {
						label: 'Yearly interest',
						value: { $bindState: '/rate' },
						min: 0,
						max: 15,
						step: 0.1,
						suffix: '%'
					},
					children: []
				},
				years: {
					type: 'Slider',
					props: { label: 'Years', value: { $bindState: '/years' }, min: 1, max: 50, step: 1 },
					children: []
				},
				results: {
					type: 'Stack',
					props: { direction: 'horizontal', gap: 'lg' },
					children: ['balance', 'interest']
				},
				balance: {
					type: 'Metric',
					props: {
						label: { $template: 'Balance after ${/years} years' },
						value: { $state: '/derived/balanceText' },
						detail: { $template: '${/derived/depositedText} deposited' }
					},
					children: []
				},
				interest: {
					type: 'Metric',
					props: { label: 'Interest earned', value: { $state: '/derived/interestText' } },
					children: []
				},
				table: {
					type: 'Table',
					props: {
						columns: [
							{ key: 'year', label: 'Year' },
							{ key: 'deposited', label: 'Deposited' },
							{ key: 'interest', label: 'Interest' },
							{ key: 'balance', label: 'Balance' }
						],
						rows: { $state: '/derived/milestones' }
					},
					children: []
				}
			},
			derived: {
				growth:
					'series(0, @/years, { year: i, deposited: round(@/start + @/monthly * 12 * i), balance: round(if(@/rate == 0, @/start + @/monthly * 12 * i, @/start * (1 + @/rate / 1200) ^ (12 * i) + @/monthly * ((1 + @/rate / 1200) ^ (12 * i) - 1) / (@/rate / 1200))) })',
				schedule:
					'map(@/derived/growth, { year: item.year, deposited: item.deposited, interest: item.balance - item.deposited, balance: item.balance })',
				milestones: 'filter(@/derived/schedule, item.year % 5 == 0 or item.year == @/years)',
				final: 'last(@/derived/schedule)',
				balanceText: 'format(@/derived/final.balance)',
				depositedText: 'format(@/derived/final.deposited)',
				interestText: 'format(@/derived/final.balance - @/derived/final.deposited)'
			}
		},
		data: { title: 'Savings simulator', start: 10000, monthly: 250, rate: 5, years: 20 }
	},
	expenses: {
		title: 'Expense tracker',
		layout: {
			root: 'card',
			elements: {
				card: {
					type: 'Card',
					props: { title: { $state: '/title' } },
					children: ['summary', 'used', 'table', 'chart']
				},
				summary: {
					type: 'Stack',
					props: { direction: 'horizontal', gap: 'lg' },
					children: ['budget', 'spent', 'left']
				},
				budget: {
					type: 'NumberInput',
					props: { label: 'Monthly budget', value: { $bindState: '/budget' }, min: 0, step: 50 },
					children: []
				},
				spent: {
					type: 'Metric',
					props: { label: 'Spent', value: { $state: '/derived/spentText' } },
					children: []
				},
				left: {
					type: 'Metric',
					props: { label: 'Left', value: { $state: '/derived/leftText' } },
					children: []
				},
				used: {
					type: 'Progress',
					props: { value: { $state: '/derived/total' }, max: { $state: '/budget' } },
					children: []
				},
				table: {
					type: 'DataTable',
					props: {
						rows: { $bindState: '/expenses' },
						columns: [
							{ key: 'item', label: 'Item', kind: 'text' },
							{
								key: 'category',
								label: 'Category',
								kind: 'select',
								options: [
									{ value: 'Housing', label: 'Housing' },
									{ value: 'Food', label: 'Food' },
									{ value: 'Transport', label: 'Transport' },
									{ value: 'Other', label: 'Other' }
								]
							},
							{ key: 'amount', label: 'Amount', kind: 'number' },
							{ key: 'paid', label: 'Paid', kind: 'checkbox' }
						],
						addLabel: 'Add expense',
						removable: true,
						footer: { $state: '/derived/totals' },
						empty: 'No expenses yet.'
					},
					children: []
				},
				chart: {
					type: 'BarChart',
					props: {
						title: 'By category',
						rows: { $state: '/derived/byCategory' },
						x: 'category',
						series: [{ key: 'amount', label: 'Spent' }],
						height: 'sm'
					},
					children: []
				}
			},
			derived: {
				total: 'sum(map(@/expenses, item.amount))',
				totals: '{ item: "Total", amount: format(@/derived/total, 2) }',
				spentText: 'format(@/derived/total, 2)',
				leftText: 'format(@/budget - @/derived/total, 2)',
				byCategory:
					'map(group(@/expenses, "category"), { category: item.key, amount: sum(map(item.items, item.amount)) })'
			}
		},
		data: {
			title: 'Expense tracker',
			budget: 2000,
			expenses: [
				{ item: 'Rent', category: 'Housing', amount: 1200, paid: true },
				{ item: 'Groceries', category: 'Food', amount: 182.5, paid: true },
				{ item: 'Train pass', category: 'Transport', amount: 64, paid: false }
			]
		}
	},
	blank: {
		title: 'New widget',
		layout: {
			root: 'card',
			elements: {
				card: { type: 'Card', props: { title: { $state: '/title' } }, children: ['text'] },
				text: { type: 'Text', props: { text: { $state: '/text' }, tone: 'muted' }, children: [] }
			}
		},
		data: { title: 'New widget', text: 'Edit this widget to choose what it shows.' }
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

/**
 * A widget as a static document shows it: what export writes instead of the live controls.
 * Each catalog component has one arm, so a format renderer is total over what a widget shows.
 */
export type WidgetExportBlock =
	| { readonly kind: 'heading'; readonly text: string; readonly level: 2 | 3 | 4 }
	| { readonly kind: 'paragraph'; readonly text: string; readonly muted: boolean }
	| { readonly kind: 'check'; readonly label: string; readonly checked: boolean }
	| { readonly kind: 'field'; readonly label: string; readonly value: string }
	| {
			readonly kind: 'metric';
			readonly label: string;
			readonly value: string;
			readonly detail?: string;
	  }
	| {
			readonly kind: 'progress';
			readonly label: string;
			readonly value: number;
			readonly max: number;
	  }
	| {
			readonly kind: 'table';
			readonly columns: readonly string[];
			readonly rows: readonly (readonly string[])[];
	  }
	| { readonly kind: 'badge'; readonly text: string }
	| { readonly kind: 'divider' }
	| { readonly kind: 'unsupported'; readonly type: string };

export interface WidgetExport {
	readonly title: string;
	readonly blocks: readonly WidgetExportBlock[];
}
