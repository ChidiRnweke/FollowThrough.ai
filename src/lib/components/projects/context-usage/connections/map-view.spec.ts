import { describe, expect, it } from 'vitest';
import type {
	ConnectionNode,
	ItemKey,
	ProjectConnectionsReport,
	ReadTogether
} from '$lib/models/context-usage';
import type { NoteId } from '$lib/models/notes';
import { testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { mapView, orderOf } from './map-view';

const note = (index: number, chats: number): ConnectionNode => ({
	key: `note:${testNoteId(index)}`,
	item: { kind: 'note', id: testNoteId(index), title: `Note ${index}` },
	use: chats === 0 ? { kind: 'never' } : { kind: 'read', times: chats, lastAt: testNow },
	chats
});
const skill: ConnectionNode = {
	key: `skill:${testNoteId(99)}`,
	item: { kind: 'skill', id: testNoteId(99) as NoteId, title: 'FollowThrough' },
	use: { kind: 'read', times: 9, lastAt: testNow },
	chats: 9
};
const key = (index: number): ItemKey => `note:${testNoteId(index)}`;
const pair = (a: ItemKey, b: ItemKey, chats: number, aFirst = 0, bFirst = 0): ReadTogether => ({
	a,
	b,
	chats,
	aFirst,
	bFirst
});

/** Ten chats. The skill is in nine of them; notes 1–3 form a cluster; note 4 is read alone. */
const report: ProjectConnectionsReport = {
	nodes: [skill, note(1, 5), note(2, 4), note(3, 2), note(4, 1), note(5, 0)],
	together: [
		pair(key(1), key(2), 4, 3, 1),
		pair(key(2), key(3), 2, 1, 1),
		pair(key(1), key(3), 1, 0, 1),
		pair(skill.key, key(1), 5, 5, 0),
		pair(skill.key, key(4), 1, 1, 0)
	],
	links: [{ from: key(3), to: key(5), kind: 'mentions' }],
	chats: 10,
	memoryLeftOut: 2,
	mismatches: { linkedNeverTogether: [], togetherNotLinked: [] },
	ambient: [skill.key],
	defaultThreshold: 2
};

describe('map view', () => {
	it('hides pairs below the threshold and says how many', () => {
		const view = mapView(report, { mode: 'together', min: 2, showLinked: false, allPairs: false });
		expect(view.edges).toEqual([
			{ kind: 'together', a: key(1), b: key(2), chats: 4 },
			{ kind: 'together', a: key(2), b: key(3), chats: 2 }
		]);
		expect(view.belowThreshold).toBe(2);
	});

	it("draws an ambient item's pairs only while it is selected, and never lays out on them", () => {
		const resting = mapView(report, {
			mode: 'together',
			min: 1,
			showLinked: false,
			allPairs: false
		});
		const selected = mapView(report, {
			mode: 'together',
			min: 1,
			showLinked: false,
			selected: skill.key,
			allPairs: false
		});
		expect(resting.edges.some((edge) => edge.kind === 'together' && edge.a === skill.key)).toBe(
			false
		);
		expect(
			selected.edges.filter((edge) => edge.kind === 'together' && edge.a === skill.key)
		).toHaveLength(2);
		expect(selected.layoutEdges).toEqual(resting.layoutEdges);
	});

	it('lists a read item with no drawn pair beneath the map instead of placing it', () => {
		const view = mapView(report, { mode: 'together', min: 2, showLinked: false, allPairs: false });
		expect(view.alone.map((node) => node.key)).toEqual([key(4)]);
		expect(view.placed.map((node) => node.key)).not.toContain(key(4));
	});

	it('places a linked item the agent never read only when links are shown', () => {
		const without = mapView(report, {
			mode: 'together',
			min: 1,
			showLinked: false,
			allPairs: false
		});
		const withLinks = mapView(report, {
			mode: 'together',
			min: 1,
			showLinked: true,
			allPairs: false
		});
		expect(without.placed.map((node) => node.key)).not.toContain(key(5));
		expect(withLinks.placed.map((node) => node.key)).toContain(key(5));
	});

	it('limits the map to one item and the items read with it', () => {
		const view = mapView(report, {
			mode: 'together',
			min: 1,
			showLinked: false,
			ego: key(2),
			allPairs: false
		});
		expect(view.placed.map((node) => node.key).sort()).toEqual([key(1), key(2), key(3)].sort());
	});
});

describe('reading order', () => {
	it('points from what was read first, carrying the chats it went the other way', () => {
		expect(orderOf(pair(key(1), key(2), 4, 1, 3))).toEqual({
			kind: 'order',
			from: key(2),
			to: key(1),
			chats: 3,
			back: 1
		});
	});

	it('has no direction when the pair went both ways equally often', () => {
		expect(orderOf(pair(key(1), key(2), 2, 1, 1))).toBeUndefined();
	});
});
