import type { Sql } from 'postgres';
import { journalRun, type JournalledCall, type JsonObject } from './journal.ts';

/**
 * Six weeks of chats in the showcase project, so the Agent activity page has something to
 * report: what the agent read, what it searched for and missed, which skill it loaded, and
 * which notes it reads together. Every chat is a finished run journalled like a real one.
 *
 * Two notes are never read, and one search finds nothing, so the page has work to suggest.
 * A few links between notes are recorded, so the Connections map can compare what the user
 * linked with what the agent reads together.
 */

type Call =
	| { readonly read: string }
	| { readonly memory: true }
	| { readonly search: string; readonly hits: readonly string[] }
	| { readonly skill: 'Diagramming' | 'FollowThrough' };

interface PastChat {
	readonly weeksAgo: number;
	readonly title: string;
	readonly calls: readonly Call[];
}

const chats: readonly PastChat[] = [
	{
		weeksAgo: 5,
		title: 'Summarise the customer interviews',
		calls: [
			{ read: 'Customer interviews' },
			{ search: 'what customers call Acme', hits: ['Customer interviews', 'Competitor review'] }
		]
	},
	{
		weeksAgo: 5,
		title: 'How do competitors present themselves?',
		calls: [{ read: 'Competitor review' }, { read: 'Customer interviews' }]
	},
	{
		weeksAgo: 4,
		title: 'Draft the rebrand goals',
		calls: [
			{ memory: true },
			{ read: 'Customer interviews' },
			{ read: 'Competitor review' },
			{ read: 'Rebrand brief' }
		]
	},
	{
		weeksAgo: 4,
		title: 'Turn the brief into a checklist',
		calls: [{ read: 'Rebrand brief' }, { read: 'Launch checklist' }]
	},
	{
		weeksAgo: 3,
		title: 'Sketch how the new site ships',
		calls: [
			{ skill: 'Diagramming' },
			{ read: 'Launch architecture' },
			{ search: 'legal review before publishing', hits: ['Launch architecture'] }
		]
	},
	{
		weeksAgo: 3,
		title: 'Write the brand voice rules',
		calls: [{ read: 'Rebrand brief' }, { read: 'Brand voice' }]
	},
	{
		weeksAgo: 2,
		title: 'Draft the homepage hero',
		calls: [
			{ memory: true },
			{ read: 'Brand voice' },
			{ read: 'Homepage copy' },
			{ search: 'proof points with numbers', hits: ['Customer interviews', 'Homepage copy'] }
		]
	},
	{
		weeksAgo: 2,
		title: 'Is the launch architecture still right?',
		calls: [{ skill: 'Diagramming' }, { read: 'Launch architecture' }, { read: 'Launch checklist' }]
	},
	{
		weeksAgo: 2,
		title: 'Find the agency contract terms',
		calls: [{ search: 'agency contract payment terms', hits: [] }]
	},
	{
		weeksAgo: 1,
		title: 'Plan the team photography',
		calls: [{ read: 'Photography brief' }, { read: 'Brand voice' }]
	},
	{
		weeksAgo: 1,
		title: 'Tighten the homepage copy',
		calls: [{ read: 'Brand voice' }, { read: 'Homepage copy' }, { read: 'Rebrand brief' }]
	},
	{
		weeksAgo: 1,
		title: 'What is left before launch?',
		calls: [
			{ skill: 'FollowThrough' },
			{ memory: true },
			{ read: 'Launch checklist' },
			{ read: 'Rebrand brief' },
			{ search: 'open questions before launch', hits: ['Rebrand brief', 'Launch checklist'] }
		]
	},
	{
		weeksAgo: 0,
		title: 'Check the copy against the voice rules',
		calls: [{ read: 'Homepage copy' }, { read: 'Brand voice' }]
	}
];

/** Links the user recorded. Two are read together; one pair the agent never reads together. */
const links = [
	{ from: 'Rebrand brief', to: 'Brand voice', kind: 'elaborates' },
	{ from: 'Launch architecture', to: 'Launch checklist', kind: 'mentions' },
	{ from: 'Competitor review', to: 'Survey results', kind: 'elaborates' }
] as const;

export interface ReadingHistoryScope {
	readonly userId: string;
	readonly projectId: string;
	readonly model: string;
	readonly notes: (title: string) => Promise<string>;
	readonly memory: () => Promise<readonly { readonly id: string; readonly content: string }[]>;
	readonly skills: (name: 'Diagramming' | 'FollowThrough') => Promise<string>;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * What `get_note` returns. The activity log finds the note through `body.file.path`, the
 * Markdown file the agent edits against, so the shape matters and not only the id.
 */
export const getNoteOutput = (projectId: string, noteId: string, title: string): JsonObject => ({
	noteId,
	title,
	etag: `note:${noteId}:r1`,
	body: {
		kind: 'file',
		file: {
			kind: 'file',
			path: `/projects/${projectId}/notes/${noteId}.md`,
			mediaType: 'text/markdown'
		}
	},
	todos: [],
	diagrams: [],
	backlinks: [],
	references: [],
	pendingSuggestions: []
});

const callFor = async (scope: ReadingHistoryScope, call: Call): Promise<JournalledCall> => {
	if ('read' in call) {
		const noteId = await scope.notes(call.read);
		return {
			name: 'get_note',
			input: { noteId },
			output: getNoteOutput(scope.projectId, noteId, call.read)
		};
	}
	if ('memory' in call) {
		const entries = await scope.memory();
		return {
			name: 'list_project_memory',
			input: { projectId: scope.projectId },
			output: {
				entries: entries.map((entry) => ({
					id: entry.id,
					content: entry.content,
					projectId: scope.projectId,
					createdAt: new Date().toISOString()
				}))
			}
		};
	}
	if ('skill' in call) {
		const noteId = await scope.skills(call.skill);
		return {
			name: 'load_skill',
			input: { name: call.skill },
			output: { noteId, name: call.skill }
		};
	}
	const hits = await Promise.all(
		call.hits.map(async (title) => {
			const id = await scope.notes(title);
			return {
				source: { kind: 'note', id, projectId: scope.projectId, title },
				noteId: id,
				content: `${title}: matching passage.`,
				score: 0.8
			};
		})
	);
	return {
		name: 'search',
		input: { query: call.search, projectId: scope.projectId },
		output: hits
	};
};

export const seedReadingHistory = async (sql: Sql, scope: ReadingHistoryScope): Promise<void> => {
	const now = Date.now();
	for (const [index, chat] of chats.entries()) {
		// Spread a week's chats over its days. This week's chats sit hours ago, not days.
		const offset =
			chat.weeksAgo === 0
				? (3 + index) * 60 * 60 * 1000
				: (chat.weeksAgo * 7 + (index % 5)) * DAY + (index % 7) * 60 * 60 * 1000;
		await journalRun(sql, {
			userId: scope.userId,
			projectId: scope.projectId,
			noteId: null,
			title: chat.title,
			prompt: chat.title,
			startedAt: new Date(now - offset),
			model: scope.model,
			speech: null,
			calls: await Promise.all(chat.calls.map((call) => callFor(scope, call)))
		});
	}
	for (const link of links)
		await sql`
			insert into note_relationships (user_id, source_note_id, target_note_id, kind, justification)
			values (
				${scope.userId}, ${await scope.notes(link.from)}, ${await scope.notes(link.to)},
				${link.kind}, 'Recorded while planning the rebrand.'
			)
		`;
};
