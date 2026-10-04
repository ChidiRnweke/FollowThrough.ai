import { describe, expect, it } from 'vitest';
import { widgetCatalog, widgetTemplates, type WidgetEdit } from '$lib/models/widgets';
import {
	applyWidgetChange,
	applyWidgetChanges,
	applyWidgetEdit,
	createWidget,
	diffWidgetData,
	rebaseWidgetParts,
	widgetChangesBetween
} from './edits';
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
			createWidget(
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
			createWidget(
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
		const result = applyWidgetEdit(widgetBuilder(), tickFirst, widgetCatalog, later);
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
			applyWidgetEdit(widgetBuilder({ dataRevision: 3 }), tickFirst, widgetCatalog, later)
		).toEqual({ kind: 'stale', part: 'data', currentRevision: 3 });
	});
	it('ignores the layout revision for a data edit', () => {
		expect(
			applyWidgetEdit(widgetBuilder({ layoutRevision: 7 }), tickFirst, widgetCatalog, later).kind
		).toBe('applied');
	});
	it('reports a path that does not exist as an issue', () => {
		expect(
			applyWidgetEdit(
				widgetBuilder(),
				{ ...tickFirst, patch: [{ op: 'replace', path: '/missing/0', value: 1 }] },
				widgetCatalog,
				later
			).kind
		).toBe('invalid');
	});
	it('rejects data that no longer matches a repeated list', () => {
		expect(
			applyWidgetEdit(
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
			applyWidgetEdit(
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
			applyWidgetEdit(
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
		const result = applyWidgetEdit(
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
		const result = applyWidgetEdit(
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
		expect(diffWidgetData(before, after)).toEqual([
			{ op: 'replace', path: '/items/0/done', value: true }
		]);
	});
	it('escapes keys that contain a slash', () => {
		expect(diffWidgetData({}, { 'a/b': 1 })).toEqual([{ op: 'add', path: '/a~1b', value: 1 }]);
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
		expect(rebaseWidgetParts(widgetBuilder(), ticked(0), ticked(1))).toEqual({
			data: ticked(0, 1).data,
			dataRevision: 2,
			layoutRevision: 1,
			overlaps: false
		});
	});
	it('does not count the same tick on both sides as a collision', () => {
		expect(rebaseWidgetParts(widgetBuilder(), ticked(0), ticked(0)).overlaps).toBe(false);
	});
	it('collides when both sides change one value differently', () => {
		const renamed = (label: string) =>
			widgetBuilder({
				data: {
					...widgetTemplates.checklist.data,
					items: [{ ...items[0], label }, ...items.slice(1)]
				}
			});
		expect(rebaseWidgetParts(widgetBuilder(), renamed('Mine'), renamed('Theirs')).overlaps).toBe(
			true
		);
	});
	it('collides when the other side changed the length of the list it edits', () => {
		const shorter = widgetBuilder({
			data: { ...widgetTemplates.checklist.data, items: items.slice(1) }
		});
		expect(rebaseWidgetParts(widgetBuilder(), ticked(0), shorter).overlaps).toBe(true);
	});
	it('takes the newer data when only the layout changed locally', () => {
		const relaid = widgetBuilder({
			layout: { ...widgetTemplates.checklist.layout, root: 'items' }
		});
		expect(rebaseWidgetParts(widgetBuilder(), relaid, ticked(2))).toEqual({
			data: ticked(2).data,
			dataRevision: 1,
			layoutRevision: 2,
			overlaps: false
		});
	});
});

describe('applying a change without a revision', () => {
	it('applies to the widget as it is now, whatever its revision', () => {
		const result = applyWidgetChange(
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
			createWidget(
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
			applyWidgetEdit(
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
			applyWidgetEdit(
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
		expect(widgetChangesBetween(widgetBuilder(), withList).map((change) => change.kind)).toEqual([
			'parts'
		]);
	});
	it('applies a combined change that is only valid as a pair', () => {
		expect(
			applyWidgetChanges(
				widgetBuilder(),
				widgetChangesBetween(widgetBuilder(), withList),
				widgetCatalog,
				later
			).kind
		).toBe('applied');
	});
	it('sends only a rename when only the title changed', () => {
		expect(
			widgetChangesBetween(widgetBuilder(), {
				title: ' Launch ',
				layout: widgetTemplates.checklist.layout,
				data: widgetTemplates.checklist.data
			})
		).toEqual([{ kind: 'rename', title: 'Launch' }]);
	});
});
