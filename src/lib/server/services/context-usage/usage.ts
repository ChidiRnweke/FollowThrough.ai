import type {
	ChatUsage,
	ContextItem,
	ContextTouch,
	HiddenAttachment,
	MissedSearch,
	ProjectContextUsageSummary,
	ProjectItem,
	UsageRow
} from '$lib/models/context-usage';
import type { AttachmentView } from '$lib/models/attachments';
import type { MemoryEntry } from '$lib/models/memory';
import type { Note } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
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

/**
 * Text the search index holds. `partial` is searchable for what was extracted, so it is
 * both something the agent can use and something it cannot fully see.
 */
const searchable = new Set(['ready', 'partial']);

export class ProjectContextUsageService implements ProjectContextUsage {
	constructor(private readonly log: ToolContextLogRepository) {}

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
		for (const touch of log.touches) {
			const item = resolve(touch);
			if (!item) continue;
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

		return {
			mostUsed,
			neverUsed: items.filter((item) => !usage.has(keyOf(item))),
			chats: chatRows,
			hiddenAttachments,
			missedSearches,
			unreadableCalls: log.unreadableCalls
		};
	}
}
