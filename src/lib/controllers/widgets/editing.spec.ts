import { describe, expect, it } from 'vitest';
import { widgetCatalog, widgetTemplates, type WidgetEdit } from '$lib/models/widgets';
import { createWidgetEditingController } from '$lib/factories/widgets/editing';
const widgetEditing = createWidgetEditingController();
import { WidgetPatchService } from '$lib/services/widgets/patches';
const widgetPatches = new WidgetPatchService();
import { widgetBuilder, testWidgetId } from '$lib/testing/widgets/fixtures/widgets';
import { testActor, testNow, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';

const later = '2026-07-11T10:00:00.000Z' as typeof testNow;
const tickFirst: Extract<WidgetEdit, { kind: 'data' }> = {
	kind: 'data',
	expectedDataRevision: 1,
	patch: [{ op: 'replace', path: '/items/0/done', value: true }]
};

describe('creating a widget', () => {
	it('accepts the checklist template', () => {
		expect(
			widgetEditing.createWidget(
				widgetTemplates.checklist,
				{
					id: testWidgetId(),
					userId: testActor().userId,
					projectId: testProjectId(),
					now: testNow
				},
				widgetCatalog
			).kind
		).toBe('applied');
	});
	it('rejects a component outside the catalog', () => {
		expect(
			widgetEditing.createWidget(
				{
					title: 'Frame',
					layout: { root: 'x', elements: { x: { type: 'Iframe', props: {}, children: [] } } },
					data: {}
				},
				{
					id: testWidgetId(),
					userId: testActor().userId,
					projectId: testProjectId(),
					now: testNow
				},
				widgetCatalog
			)
		).toEqual({
			kind: 'invalid',
			issues: [{ path: '/layout/elements/x/type', message: 'Iframe is not in the widget catalog' }]
		});
	});
});

describe('editing widget data', () => {
	it('applies the patch and advances only the data revision', () => {
		const result = widgetEditing.applyWidgetEdit(widgetBuilder(), tickFirst, widgetCatalog, later);
		expect(
			result.kind === 'applied' && [
				result.widget.data,
				result.widget.dataRevision,
				result.widget.layoutRevision
			]
		).toEqual([
			{
				...widgetTemplates.checklist.data,
				items: [
					{ ...widgetTemplates.checklist.data.items[0], done: true },
					...widgetTemplates.checklist.data.items.slice(1)
				]
			},
			2,
			1
		]);
	});
	it('reports a stale data revision without applying it', () => {
		expect(
			widgetEditing.applyWidgetEdit(
				widgetBuilder({ dataRevision: 3 }),
				tickFirst,
				widgetCatalog,
				later
			)
		).toEqual({ kind: 'stale', part: 'data', currentRevision: 3 });
	});
	it('ignores the layout revision for a data edit', () => {
		expect(
			widgetEditing.applyWidgetEdit(
				widgetBuilder({ layoutRevision: 7 }),
				tickFirst,
				widgetCatalog,
				later
			).kind
		).toBe('applied');
	});
	it('reports a path that does not exist as an issue', () => {
		expect(
			widgetEditing.applyWidgetEdit(
				widgetBuilder(),
				{ ...tickFirst, patch: [{ op: 'replace', path: '/missing/0', value: 1 }] },
				widgetCatalog,
				later
			).kind
		).toBe('invalid');
	});
	it('rejects data that no longer matches a repeated list', () => {
		expect(
			widgetEditing.applyWidgetEdit(
				widgetBuilder(),
				{ ...tickFirst, patch: [{ op: 'replace', path: '/items', value: 'none' }] },
				widgetCatalog,
				later
			).kind
		).toBe('invalid');
	});
});

describe('editing widget layout', () => {
	it('rejects props that the component does not accept', () => {
		expect(
			widgetEditing.applyWidgetEdit(
				widgetBuilder(),
				{
					kind: 'layout',
					expectedLayoutRevision: 1,
					patch: [{ op: 'replace', path: '/elements/item/props/checked', value: 'yes' }]
				},
				widgetCatalog,
				later
			).kind
		).toBe('invalid');
	});
	it('rejects a child key with no element', () => {
		expect(
			widgetEditing.applyWidgetEdit(
				widgetBuilder(),
				{
					kind: 'layout',
					expectedLayoutRevision: 1,
					patch: [{ op: 'add', path: '/elements/card/children/-', value: 'ghost' }]
				},
				widgetCatalog,
				later
			).kind
		).toBe('invalid');
	});
	it('applies a cataloged addition and advances only the layout revision', () => {
		const result = widgetEditing.applyWidgetEdit(
			widgetBuilder(),
			{
				kind: 'layout',
				expectedLayoutRevision: 1,
				patch: [
					{
						op: 'add',
						path: '/elements/note',
						value: { type: 'Text', props: { text: 'Due Friday' }, children: [] }
					},
					{ op: 'add', path: '/elements/card/children/0', value: 'note' }
				]
			},
			widgetCatalog,
			later
		);
		expect(
			result.kind === 'applied' && [result.widget.layoutRevision, result.widget.dataRevision]
		).toEqual([2, 1]);
	});
});

describe('renaming a widget', () => {
	it('trims the new title', () => {
		const result = widgetEditing.applyWidgetEdit(
			widgetBuilder(),
			{ kind: 'rename', title: '  Launch  ' },
			widgetCatalog,
			later
		);
		expect(result.kind === 'applied' && result.widget.title).toBe('Launch');
	});
});

describe('diffing widget data', () => {
	it('produces one replace for one ticked item', () => {
		const before = widgetTemplates.checklist.data;
		const after = {
			...before,
			items: [{ ...before.items[0], done: true }, ...before.items.slice(1)]
		};
		expect(widgetPatches.diffData(before, after)).toEqual([
			{ op: 'replace', path: '/items/0/done', value: true }
		]);
	});
	it('escapes keys that contain a slash', () => {
		expect(widgetPatches.diffData({}, { 'a/b': 1 })).toEqual([
			{ op: 'add', path: '/a~1b', value: 1 }
		]);
	});
});

describe('replaying a widget onto a newer one', () => {
	const items = widgetTemplates.checklist.data.items;
	const ticked = (...indexes: number[]) =>
		widgetBuilder({
			data: {
				...widgetTemplates.checklist.data,
				items: items.map((item, index) => ({ ...item, done: indexes.includes(index) }))
			}
		});
	it('merges ticks of different items', () => {
		expect(widgetPatches.rebaseParts(widgetBuilder(), ticked(0), ticked(1))).toEqual({
			data: ticked(0, 1).data,
			dataRevision: 2,
			layoutRevision: 1,
			overlaps: false
		});
	});
	it('does not count the same tick on both sides as a collision', () => {
		expect(widgetPatches.rebaseParts(widgetBuilder(), ticked(0), ticked(0)).overlaps).toBe(false);
	});
	it('collides when both sides change one value differently', () => {
		const renamed = (label: string) =>
			widgetBuilder({
				data: {
					...widgetTemplates.checklist.data,
					items: [{ ...items[0], label }, ...items.slice(1)]
				}
			});
		expect(
			widgetPatches.rebaseParts(widgetBuilder(), renamed('Mine'), renamed('Theirs')).overlaps
		).toBe(true);
	});
	it('collides when the other side changed the length of the list it edits', () => {
		const shorter = widgetBuilder({
			data: { ...widgetTemplates.checklist.data, items: items.slice(1) }
		});
		expect(widgetPatches.rebaseParts(widgetBuilder(), ticked(0), shorter).overlaps).toBe(true);
	});
	it('takes the newer data when only the layout changed locally', () => {
		const relaid = widgetBuilder({
			layout: { ...widgetTemplates.checklist.layout, root: 'items' }
		});
		expect(widgetPatches.rebaseParts(widgetBuilder(), relaid, ticked(2))).toEqual({
			data: ticked(2).data,
			dataRevision: 1,
			layoutRevision: 2,
			overlaps: false
		});
	});
});

describe('applying a change without a revision', () => {
	it('applies to the widget as it is now, whatever its revision', () => {
		const result = widgetEditing.applyWidgetChange(
			widgetBuilder({ dataRevision: 7 }),
			{ kind: 'data', patch: tickFirst.patch },
			widgetCatalog,
			later
		);
		expect(result.kind === 'applied' && result.widget.dataRevision).toBe(8);
	});
});

describe('templates and catalog version 2', () => {
	it.each(Object.keys(widgetTemplates))('accepts the %s template', (name) => {
		expect(
			widgetEditing.createWidget(
				widgetTemplates[name as keyof typeof widgetTemplates],
				{
					id: testWidgetId(),
					userId: testActor().userId,
					projectId: testProjectId(),
					now: testNow
				},
				widgetCatalog
			).kind
		).toBe('applied');
	});
	it('rejects a badge tone outside the catalog', () => {
		expect(
			widgetEditing.applyWidgetEdit(
				widgetBuilder({ layout: widgetTemplates.status.layout, data: widgetTemplates.status.data }),
				{
					kind: 'layout',
					expectedLayoutRevision: 1,
					patch: [{ op: 'replace', path: '/elements/flag/props/tone', value: 'neon' }]
				},
				widgetCatalog,
				later
			).kind
		).toBe('invalid');
	});
	it('rejects a visibility rule json-render does not understand', () => {
		expect(
			widgetEditing.applyWidgetEdit(
				widgetBuilder(),
				{
					kind: 'layout',
					expectedLayoutRevision: 1,
					patch: [{ op: 'add', path: '/elements/item/visible', value: { $script: 'alert(1)' } }]
				},
				widgetCatalog,
				later
			).kind
		).toBe('invalid');
	});
});

describe('changes from edited content', () => {
	const withList = {
		title: 'Checklist',
		layout: {
			...widgetTemplates.checklist.layout,
			elements: {
				...widgetTemplates.checklist.layout.elements,
				card: { ...widgetTemplates.checklist.layout.elements.card, children: ['items', 'notes'] },
				notes: {
					type: 'Stack',
					props: {},
					repeat: { statePath: '/notes', key: 'id' },
					children: ['note']
				},
				note: { type: 'Text', props: { text: { $item: 'text' } }, children: [] }
			}
		},
		data: { ...widgetTemplates.checklist.data, notes: [{ id: 'n1', text: 'Remember' }] }
	};
	it('sends a new list and its array as one combined change', () => {
		expect(
			widgetPatches.changesBetween(widgetBuilder(), withList).map((change) => change.kind)
		).toEqual(['parts']);
	});
	it('applies a combined change that is only valid as a pair', () => {
		expect(
			widgetEditing.applyWidgetChanges(
				widgetBuilder(),
				widgetPatches.changesBetween(widgetBuilder(), withList),
				widgetCatalog,
				later
			).kind
		).toBe('applied');
	});
	it('sends only a rename when only the title changed', () => {
		expect(
			widgetPatches.changesBetween(widgetBuilder(), {
				title: ' Launch ',
				layout: widgetTemplates.checklist.layout,
				data: widgetTemplates.checklist.data
			})
		).toEqual([{ kind: 'rename', title: 'Launch' }]);
	});
});

describe('formulas in a layout', () => {
	const addDerived = (derived: Record<string, string>) =>
		widgetEditing.applyWidgetChange(
			widgetBuilder(),
			{ kind: 'layout', patch: [{ op: 'add', path: '/derived', value: derived }] },
			widgetCatalog,
			later
		);
	it('accepts formulas that read the data and each other', () => {
		expect(addDerived({ open: 'count(@/items)', half: '@/derived/open / 2' }).kind).toBe('applied');
	});
	it('refuses a formula that does not parse, naming it', () => {
		expect(addDerived({ open: 'count(@/items' })).toEqual({
			kind: 'invalid',
			issues: [
				{
					path: '/layout/derived/open',
					message: 'Expected ")" but found the end (at character 14)'
				}
			]
		});
	});
	it('refuses formulas that read each other in a circle', () => {
		expect(addDerived({ a: '@/derived/b', b: '@/derived/a + 1' })).toEqual({
			kind: 'invalid',
			issues: [{ path: '/layout/derived/a', message: 'These formulas read each other: a → b → a' }]
		});
	});
	it('refuses a read of a derived value that is not defined', () => {
		expect(addDerived({ a: '@/derived/missing' })).toEqual({
			kind: 'invalid',
			issues: [{ path: '/layout/derived/a', message: '@/derived/missing is not defined' }]
		});
	});
	it('refuses a control bound to a computed value', () => {
		expect(
			widgetEditing.applyWidgetChange(
				widgetBuilder(),
				{
					kind: 'layout',
					patch: [
						{
							op: 'replace',
							path: '/elements/item/props/checked',
							value: { $bindState: '/derived/x' }
						}
					]
				},
				widgetCatalog,
				later
			)
		).toEqual({
			kind: 'invalid',
			issues: [
				{
					path: '/layout/elements/item/props/checked',
					message: 'A computed value can be read with $state but not bound'
				}
			]
		});
	});
	it('refuses data that claims the computed root', () => {
		expect(
			widgetEditing.applyWidgetChange(
				widgetBuilder(),
				{ kind: 'data', patch: [{ op: 'add', path: '/derived', value: {} }] },
				widgetCatalog,
				later
			)
		).toEqual({
			kind: 'invalid',
			issues: [{ path: '/data/derived', message: '"derived" is reserved for computed values' }]
		});
	});
});

it('reports invalid data before an invalid layout patch in a combined edit', () => {
	const result = widgetEditing.applyWidgetChange(
		widgetBuilder(),
		{
			kind: 'parts',
			data: [{ op: 'replace', path: '', value: [] }],
			layout: [{ op: 'remove', path: '/missing' }]
		},
		widgetCatalog,
		later
	);
	expect(result.kind === 'invalid' && result.issues.map((issue) => issue.path)).toEqual(['/data']);
});
