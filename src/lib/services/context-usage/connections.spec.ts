import { describe, expect, it } from 'vitest';
import type {
	AuthoredLink,
	ConnectionNode,
	ItemKey,
	ProjectConnections,
	ReadTogether
} from '$lib/models/context-usage';
import type { DateTime } from '$lib/models/workspace';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import { ConnectionAnalysisService } from './connections';

const rules = new ConnectionAnalysisService();

const keyOf = (n: number): ItemKey => `note:${testNoteId(n)}`;

const node = (n: number, chats: number, title = `Note ${n}`): ConnectionNode => ({
	key: keyOf(n),
	item: { kind: 'note', id: testNoteId(n), title },
	use:
		chats > 0
			? { kind: 'read', times: chats, lastAt: '2026-10-01T09:00:00.000Z' as DateTime }
			: { kind: 'never' },
	chats
});

const edge = (x: number, y: number, chats: number, aFirst = 0, bFirst = 0): ReadTogether => ({
	a: keyOf(x),
	b: keyOf(y),
	chats,
	aFirst,
	bFirst
});

const link = (
	from: number,
	to: number,
	kind: AuthoredLink['kind'] = 'elaborates'
): AuthoredLink => ({
	from: keyOf(from),
	to: keyOf(to),
	kind
});

const connections = (over: Partial<ProjectConnections>): ProjectConnections => ({
	nodes: [],
	together: [],
	links: [],
	chats: 0,
	memoryLeftOut: 0,
	...over
});

describe('Where links and reading disagree', () => {
	it('names links never read together, and unlinked pairs read together in two chats or more', () => {
		const result = rules.mismatches(
			connections({
				nodes: [1, 2, 3, 4, 5, 6, 7].map((n) => node(n, 3)),
				links: [link(1, 2), link(3, 1, 'mentions')],
				together: [edge(1, 3, 3), edge(3, 4, 2), edge(5, 6, 4), edge(6, 7, 1)]
			})
		);
		expect(result).toEqual({
			linkedNeverTogether: [link(1, 2)],
			togetherNotLinked: [edge(5, 6, 4), edge(3, 4, 2)]
		});
	});

	it('does not suggest linking an item read in most chats to what it happens to meet', () => {
		const result = rules.mismatches(
			connections({
				chats: 10,
				nodes: [node(1, 9), node(2, 4), node(3, 4)],
				together: [edge(1, 2, 4), edge(2, 3, 3)]
			})
		);
		expect(result.togetherNotLinked).toEqual([edge(2, 3, 3)]);
	});
});

describe('Ambient items', () => {
	it('are items read in at least 60% of five or more chats', () => {
		const result = rules.ambient(
			connections({ chats: 5, nodes: [node(1, 3), node(2, 2), node(3, 5)] })
		);
		expect(result).toEqual([keyOf(1), keyOf(3)]);
	});

	it('do not exist under five chats, however often an item is read', () => {
		const result = rules.ambient(connections({ chats: 4, nodes: [node(1, 4)] }));
		expect(result).toEqual([]);
	});
});

describe('The default threshold', () => {
	const items = [1, 2, 3, 4, 5, 6, 7, 8];
	const core = (n: number) => n <= 4;
	/**
	 * One chat read all eight items; the other chats read only the first four. Every pair is
	 * drawn at 1: 28 edges over 8 items. At 2 only the first four's 6 edges remain.
	 */
	const dense = (chats: number) =>
		connections({
			chats,
			nodes: items.map((n) => node(n, core(n) ? chats : 1)),
			together: items.flatMap((x) =>
				items.filter((y) => y > x).map((y) => edge(x, y, core(x) && core(y) ? chats : 1))
			)
		});

	it('rises past 1 when every pair is drawn, to the first step with a few edges per item', () => {
		expect(rules.defaultThreshold(dense(3))).toBe(2);
	});

	it('leaves out edges to ambient items when it counts', () => {
		// In six chats the first four are ambient; the 6 edges among the rest read fine at 1.
		expect(rules.defaultThreshold(dense(6))).toBe(1);
	});
});

describe('The connection tables', () => {
	it('quotes a title that holds a comma and a quote', () => {
		const result = rules.tables(connections({ chats: 1, nodes: [node(1, 1, 'Q3 plan, "final"')] }));
		expect(result.nodes).toBe(
			'key,kind,title,times_read,last_read,chats\r\n' +
				`${keyOf(1)},note,"Q3 plan, ""final""",1,2026-10-01T09:00:00.000Z,1\r\n`
		);
	});

	it('writes one row per pair read together or linked, by key where titles collide', () => {
		const result = rules.tables(
			connections({
				chats: 2,
				nodes: [node(1, 2, 'Brief'), node(2, 2, 'Notes'), node(3, 0, 'Notes')],
				together: [edge(1, 2, 2, 1, 0)],
				links: [link(2, 1, 'mentions'), link(3, 1)]
			})
		);
		expect(result.edges).toBe(
			'item_a,item_b,chats_read_together,a_before_b_chats,b_before_a_chats,linked_kinds\r\n' +
				`Brief,${keyOf(2)},2,1,0,mentions\r\n` +
				`Brief,${keyOf(3)},0,0,0,elaborates\r\n`
		);
	});
});
