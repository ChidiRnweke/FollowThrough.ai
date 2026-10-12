import type {
	AuthoredLink,
	ChatUsage,
	ConnectionNode,
	ContextItem,
	ContextTouch,
	HiddenAttachment,
	ItemKey,
	KindCoverage,
	LoggedConversation,
	WeeklyReads,
	MissedSearch,
	ProjectConnections,
	ProjectContextUsageSummary,
	ProjectItem,
	ReadTogether,
	UsageRow
} from '$lib/models/context-usage';
import type { AttachmentView } from '$lib/models/attachments';
import type { MemoryEntry } from '$lib/models/memory';
import type { Note } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime } from '$lib/models/workspace';
import type {
	ProjectLinkRepository,
	ToolContextLogRepository
} from '$lib/server/repositories/context-usage';

/** What the project holds, as its own services return it. */
export interface ProjectHoldings {
	readonly notes: readonly Note[];
	readonly attachments: readonly AttachmentView[];
	readonly memory: readonly MemoryEntry[];
}

export interface ProjectContextUsage {
	summarise(projectId: ProjectId, holdings: ProjectHoldings): Promise<ProjectContextUsageSummary>;
	/** What the agent read together in this project, beside what the user linked. */
	connect(projectId: ProjectId, holdings: ProjectHoldings): Promise<ProjectConnections>;
}

const keyOf = (
	item: Pick<ContextItem, 'kind' | 'id'> | Pick<ContextTouch, 'kind' | 'id'>
): ItemKey => `${item.kind}:${item.id}`;

const fileName = (path: string) => path.split('/').at(-1) ?? path;

const DAY = 24 * 60 * 60 * 1000;

const emptyWeek = (week: number): WeeklyReads => ({
	weekStart: new Date(week).toISOString() as DateTime,
	note: 0,
	attachment: 0,
	memory: 0,
	skill: 0
});

/** Monday 00:00 UTC of the week an instant falls in. */
const weekOf = (instant: string): number => {
	const day = new Date(instant);
	const midnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
	return midnight - ((day.getUTCDay() + 6) % 7) * DAY;
};

/**
 * Text the search index holds. `partial` is searchable for what was extracted, so it is
 * both something the agent can use and something it cannot fully see.
 */
const searchable = new Set(['ready', 'partial']);

/** The content the project holds that the agent can be seen to use. */
const inventoryOf = (holdings: ProjectHoldings): ProjectItem[] => [
	...holdings.notes
		.filter((note) => note.kind === 'note' && !note.archivedAt)
		.map((note): ProjectItem => ({ kind: 'note', id: note.id, title: note.title })),
	...holdings.attachments
		.filter(({ version }) => searchable.has(version.processingStatus))
		.map(({ attachment }): ProjectItem => ({
			kind: 'attachment',
			id: attachment.id,
			title: fileName(attachment.path)
		})),
	...holdings.memory.map((entry): ProjectItem => ({
		kind: 'memory',
		id: entry.id,
		title: entry.content
	}))
];

/**
 * The item a touch drew on, if it is this project's. Content names its own project. A skill
 * belongs to no project, so it counts where the chat was opened. Content no longer in the
 * project — deleted, archived — has nothing to open and is left out.
 *
 * Both the summary and the connections attribute through this one rule, so they cannot
 * disagree about what the agent read here.
 */
const attribution = (
	projectId: ProjectId,
	inventory: ReadonlyMap<ItemKey, ContextItem>,
	conversations: readonly LoggedConversation[]
) => {
	const chatProject = new Map(conversations.map((chat) => [chat.id, chat.projectId]));
	return (touch: ContextTouch): ContextItem | undefined => {
		if (touch.kind === 'skill')
			return chatProject.get(touch.conversationId) === projectId
				? { kind: 'skill', id: touch.id, title: touch.title }
				: undefined;
		return touch.projectId === projectId ? inventory.get(keyOf(touch)) : undefined;
	};
};

const timesRead = (node: ConnectionNode) => (node.use.kind === 'read' ? node.use.times : 0);

export class ProjectContextUsageService implements ProjectContextUsage {
	constructor(
		private readonly log: ToolContextLogRepository,
		private readonly links: ProjectLinkRepository,
		private readonly now: () => DateTime
	) {}

	async summarise(
		projectId: ProjectId,
		holdings: ProjectHoldings
	): Promise<ProjectContextUsageSummary> {
		const log = await this.log.read();

		const items = inventoryOf(holdings);
		const chatProject = new Map(log.conversations.map((chat) => [chat.id, chat]));
		const resolve = attribution(
			projectId,
			new Map(items.map((item) => [keyOf(item), item])),
			log.conversations
		);

		const usage = new Map<string, { item: ContextItem; uses: number; lastUsedAt: string }>();
		const chats = new Map<string, { lastUsedAt: string; items: Map<string, ContextItem> }>();
		const weeks = new Map<number, WeeklyReads>();
		for (const touch of log.touches) {
			const item = resolve(touch);
			if (!item) continue;
			const week = weekOf(touch.at);
			const counts = weeks.get(week) ?? emptyWeek(week);
			weeks.set(week, { ...counts, [item.kind]: counts[item.kind] + 1 });
			const key = keyOf(item);
			const row = usage.get(key);
			usage.set(key, {
				item,
				uses: (row?.uses ?? 0) + 1,
				lastUsedAt: row && row.lastUsedAt > touch.at ? row.lastUsedAt : touch.at
			});
			const chat = chats.get(touch.conversationId) ?? { lastUsedAt: touch.at, items: new Map() };
			chat.items.set(key, item);
			if (touch.at > chat.lastUsedAt) chat.lastUsedAt = touch.at;
			chats.set(touch.conversationId, chat);
		}

		const mostUsed = [...usage.values()]
			.sort((a, b) => b.uses - a.uses || b.lastUsedAt.localeCompare(a.lastUsedAt))
			.map((row): UsageRow => ({ ...row, lastUsedAt: row.lastUsedAt as UsageRow['lastUsedAt'] }));

		const chatRows = [...chats.entries()]
			.map(([id, chat]): ChatUsage => {
				const title = chatProject.get(id as ChatUsage['conversationId'])?.title;
				return {
					conversationId: id as ChatUsage['conversationId'],
					...(title ? { title } : {}),
					lastUsedAt: chat.lastUsedAt as ChatUsage['lastUsedAt'],
					items: [...chat.items.values()]
				};
			})
			.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));

		// A search scoped elsewhere is another project's gap; an unscoped one belongs to the
		// project the chat was opened from, which is the only project it can be said to be about.
		// The same gap asked twice is one gap asked harder, so it is one row with a count.
		// Queries differ only by case and spacing as often as they differ at all.
		const missed = new Map<string, MissedSearch>();
		for (const search of log.emptySearches) {
			const here = search.projectId
				? search.projectId === projectId
				: chatProject.get(search.conversationId)?.projectId === projectId;
			if (!here) continue;
			const key = search.query.trim().toLowerCase().replace(/\s+/g, ' ');
			const row = missed.get(key);
			const later = !row || search.at > row.lastAt;
			missed.set(key, {
				query: later ? search.query : row.query,
				times: (row?.times ?? 0) + 1,
				lastAt: later ? search.at : row.lastAt,
				conversationId: later ? search.conversationId : row.conversationId
			});
		}
		const missedSearches = [...missed.values()].sort(
			(a, b) => b.times - a.times || b.lastAt.localeCompare(a.lastAt)
		);

		const hiddenAttachments = holdings.attachments.flatMap(
			({ attachment, version }): HiddenAttachment[] =>
				version.processingStatus === 'ready'
					? []
					: [
							{
								id: attachment.id,
								title: fileName(attachment.path),
								status: version.processingStatus,
								...(version.processingFailure ? { failure: version.processingFailure } : {})
							}
						]
		);

		// Every week from the first lookup to this one, so a quiet week reads as a gap, not as
		// nothing between two neighbours.
		const activity: WeeklyReads[] = [];
		if (weeks.size > 0)
			for (let week = Math.min(...weeks.keys()); week <= weekOf(this.now()); week += 7 * DAY)
				activity.push(weeks.get(week) ?? emptyWeek(week));

		const coverage = (['note', 'attachment', 'memory'] as const).map((kind): KindCoverage => ({
			kind,
			used: items.filter((item) => item.kind === kind && usage.has(keyOf(item))).length,
			total: items.filter((item) => item.kind === kind).length
		}));

		return {
			mostUsed,
			neverUsed: items.filter((item) => !usage.has(keyOf(item))),
			chats: chatRows,
			hiddenAttachments,
			missedSearches,
			activity,
			coverage,
			unreadableCalls: log.unreadableCalls
		};
	}

	async connect(projectId: ProjectId, holdings: ProjectHoldings): Promise<ProjectConnections> {
		const [log, records] = await Promise.all([this.log.read(), this.links.read(projectId)]);

		// A link endpoint is this project's content even when the inventory does not list it: a
		// note's own attachments are not project files, but a read of one is a read here.
		const known = new Map<ItemKey, ContextItem>();
		for (const record of records)
			for (const item of [record.from, record.to])
				if (item.kind !== 'skill') known.set(keyOf(item), item);
		for (const item of inventoryOf(holdings)) known.set(keyOf(item), item);
		const resolve = attribution(projectId, known, log.conversations);

		const reads = new Map<
			ItemKey,
			{ item: ContextItem; times: number; lastAt: DateTime; chats: Set<string> }
		>();
		const memory = new Set<ItemKey>();
		/** Per chat, the first call that read each item. */
		const chats = new Map<string, Map<ItemKey, number>>();
		for (const touch of log.touches) {
			const item = resolve(touch);
			if (!item) continue;
			const key = keyOf(item);
			const firsts = chats.get(touch.conversationId) ?? new Map<ItemKey, number>();
			chats.set(touch.conversationId, firsts);
			// Project memory loads into every chat, so reading it says nothing about what goes
			// with what. It is counted, and kept off the map.
			if (item.kind === 'memory') {
				memory.add(key);
				continue;
			}
			const read = reads.get(key) ?? { item, times: 0, lastAt: touch.at, chats: new Set() };
			reads.set(key, {
				item,
				times: read.times + 1,
				lastAt: read.lastAt > touch.at ? read.lastAt : touch.at,
				chats: read.chats.add(touch.conversationId)
			});
			const first = firsts.get(key);
			if (first === undefined || touch.call < first) firsts.set(key, touch.call);
		}

		const together = new Map<string, ReadTogether>();
		for (const firsts of chats.values()) {
			const entries = [...firsts];
			entries.forEach(([x, xCall], i) => {
				for (const [y, yCall] of entries.slice(i + 1)) {
					const [a, aCall, b, bCall] = x < y ? [x, xCall, y, yCall] : [y, yCall, x, xCall];
					const edge = together.get(`${a}|${b}`) ?? { a, b, chats: 0, aFirst: 0, bFirst: 0 };
					together.set(`${a}|${b}`, {
						a,
						b,
						chats: edge.chats + 1,
						aFirst: edge.aFirst + (aCall < bCall ? 1 : 0),
						bFirst: edge.bFirst + (bCall < aCall ? 1 : 0)
					});
				}
			});
		}

		const endpoints = new Map<ItemKey, ContextItem>();
		const links = records.map((record): AuthoredLink => {
			const from = keyOf(record.from);
			const to = keyOf(record.to);
			endpoints.set(from, record.from);
			endpoints.set(to, record.to);
			return { from, to, kind: record.kind };
		});

		const nodes: ConnectionNode[] = [
			...[...reads].map(([key, read]): ConnectionNode => ({
				key,
				item: read.item,
				use: { kind: 'read', times: read.times, lastAt: read.lastAt },
				chats: read.chats.size
			})),
			...[...endpoints]
				.filter(([key]) => !reads.has(key))
				.map(([key, item]): ConnectionNode => ({ key, item, use: { kind: 'never' }, chats: 0 }))
		].sort((x, y) => timesRead(y) - timesRead(x) || x.item.title.localeCompare(y.item.title));

		return {
			nodes,
			together: [...together.values()].sort(
				(x, y) => y.chats - x.chats || x.a.localeCompare(y.a) || x.b.localeCompare(y.b)
			),
			links,
			chats: chats.size,
			memoryLeftOut: memory.size
		};
	}
}
