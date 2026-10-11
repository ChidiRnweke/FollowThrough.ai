import type {
	ChatUsage,
	ContextItem,
	ContextTouch,
	HiddenAttachment,
	KindCoverage,
	WeeklyLookups,
	MissedSearch,
	ProjectContextUsageSummary,
	ProjectItem,
	UsageRow
} from '$lib/models/context-usage';
import type { AttachmentView } from '$lib/models/attachments';
import type { MemoryEntry } from '$lib/models/memory';
import type { Note } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime } from '$lib/models/workspace';
import type { ToolContextLogRepository } from '$lib/server/repositories/context-usage';

/** What the project holds, as its own services return it. */
export interface ProjectHoldings {
	readonly notes: readonly Note[];
	readonly attachments: readonly AttachmentView[];
	readonly memory: readonly MemoryEntry[];
}

export interface ProjectContextUsage {
	summarise(projectId: ProjectId, holdings: ProjectHoldings): Promise<ProjectContextUsageSummary>;
}

const keyOf = (item: { readonly kind: string; readonly id: string }) => `${item.kind}:${item.id}`;

const fileName = (path: string) => path.split('/').at(-1) ?? path;

const DAY = 24 * 60 * 60 * 1000;

const emptyWeek = (week: number): WeeklyLookups => ({
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

export class ProjectContextUsageService implements ProjectContextUsage {
	constructor(
		private readonly log: ToolContextLogRepository,
		private readonly now: () => DateTime
	) {}

	async summarise(
		projectId: ProjectId,
		holdings: ProjectHoldings
	): Promise<ProjectContextUsageSummary> {
		const log = await this.log.read();

		const items: ProjectItem[] = [
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
		const inventory = new Map(items.map((item) => [keyOf(item), item]));
		const chatProject = new Map(log.conversations.map((chat) => [chat.id, chat]));

		/**
		 * The item a touch drew on, if it is this project's. Content names its own project. A
		 * skill belongs to no project, so it counts where the chat was opened. Content no longer
		 * in the project — deleted, archived — has nothing to open and is left out.
		 */
		const resolve = (touch: ContextTouch): ContextItem | undefined => {
			if (touch.kind === 'skill')
				return chatProject.get(touch.conversationId)?.projectId === projectId
					? { kind: 'skill', id: touch.id, title: touch.title }
					: undefined;
			return touch.projectId === projectId ? inventory.get(keyOf(touch)) : undefined;
		};

		const usage = new Map<string, { item: ContextItem; uses: number; lastUsedAt: string }>();
		const chats = new Map<string, { lastUsedAt: string; items: Map<string, ContextItem> }>();
		const weeks = new Map<number, WeeklyLookups>();
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
		const activity: WeeklyLookups[] = [];
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
}
