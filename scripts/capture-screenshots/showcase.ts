import { createHash, randomBytes, randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import type { Page } from '@playwright/test';
import type { Sql } from 'postgres';
import { journalRun, type JournalledCall } from './journal.ts';
import { getNoteOutput, seedReadingHistory } from './reading-history.ts';

/**
 * The workspace every product screenshot is taken in: one invented studio rebranding one
 * invented company. Nothing here belongs to a real person, so the images can be published.
 *
 * Records enter through the paths production uses wherever a script can reach one — the New
 * project dialog and the markdown archive import. The rest is written with SQL in the shapes
 * the app's own writers produce: the workspace sync triggers pick those rows up like any other
 * write, and the agent transcript copies the event and message rows of a real completed run.
 */

export const SHOWCASE_USER_ID = '00000000-0000-4000-8000-00000000c0de';

export const showcaseUser = {
	id: SHOWCASE_USER_ID,
	email: 'studio@acme.example',
	displayName: 'Robin Hale'
} as const;

const PRIMARY_PROJECT = 'Acme rebrand';

const projects: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	[PRIMARY_PROJECT]: {
		'Rebrand brief.md': `Acme is replacing a fifteen-year-old identity before the November product launch. The
new brand has to work on a phone screen first and on a trade-show banner second.

## Goals

- One wordmark that reads at 16 px and at 4 m.
- A colour system with an accessible contrast pair for every surface.
- Launch copy that sounds like the people who build the product.

## Commitments from the kickoff

Priya will send the revised logo files by Friday. Dana owns the final colour tokens and will
hand them over once the contrast audit is done. We agreed that Legal reviews every piece of
customer-facing copy before it ships, and Marcus said he would book the photographer for the
team shots this week.

## Open questions

Do we keep the old icon for the mobile app until the next major release, or switch everything
on launch day? The board wants a recommendation at the October review.`,
		'Launch architecture.md': `How the new site is assembled and shipped.

\`\`\`mermaid
flowchart LR
  Tokens[Tokens] --> Build[Static build]
  CMS[Content CMS] --> Build
  Build --> Review{Legal review}
  Review -- approved --> CDN[Edge CDN]
  Review -- changes --> CMS
\`\`\`

Every page is built from the CMS and the token package. A preview link goes to Legal before
anything reaches the CDN.`,
		'Brand voice.md': `Plain words, short sentences, and no exclamation marks. We describe what the product
does for the reader, not how we feel about it.

## Say

- "Ships in two days."
- "Works offline."

## Avoid

- "Revolutionary", "seamless", "best-in-class".`,
		'Launch checklist.md': `- [x] Kickoff with the leadership team
- [x] Competitor review
- [ ] Final wordmark
- [ ] Colour tokens in the design system
- [ ] Homepage and pricing copy
- [ ] Legal sign-off
- [ ] Press kit`,
		'Homepage copy.md': `Draft two of the homepage. The hero says what Acme does in one line, then three
proof points with numbers, then one call to action.`,
		'Photography brief.md': `Team shots in the workshop, natural light, no posed handshakes. Twelve portraits
and six wide shots of people at work.`,
		'Press kit.md': `Logo files, three product photos, the founder's bio, and a one-page fact sheet.`,
		'Research/Survey results.md': `Three hundred customers answered. Reliability matters most; price is fourth.`,
		'Research/Competitor review.md': `Four competitors relaunched in the last two years. Three moved to a single-colour
wordmark; all four lead with product screenshots rather than illustration.`,
		'Research/Customer interviews.md': `Twelve interviews in September. Customers describe Acme as "dependable" and "a bit
old-fashioned". Nobody could recall the current tagline.`
	},
	'Q4 planning': {
		'Quarter goals.md': `Ship the rebrand, hire two designers, and close the agency contract. Not this
quarter: the mobile redesign.`,
		'Budget.md': `Agency fees, photography, and the trade-show stand are the three large items.`
	}
};

export interface ShowcaseIds {
	readonly projectId: string;
	readonly briefNoteId: string;
	readonly architectureNoteId: string;
	readonly diagrammingSkillId: string;
	readonly conversationTitle: string;
	readonly closingLine: string;
}

/** Start from an empty workspace. The cascade on `users` clears every row the user owns. */
export const resetShowcase = async (sql: Sql): Promise<void> => {
	await sql`delete from users where id = ${SHOWCASE_USER_ID}`;
	await sql`
		insert into users (id, email, display_name, role)
		values (${showcaseUser.id}, ${showcaseUser.email}, ${showcaseUser.displayName}, 'USER')
	`;
};

const archiveFor = (files: Readonly<Record<string, string>>): Buffer => {
	const zip = new AdmZip();
	for (const [path, body] of Object.entries(files)) zip.addFile(path, Buffer.from(`${body}\n`));
	return zip.toBuffer();
};

/**
 * The New project dialog writes to the browser's replica first and syncs afterwards, so the
 * project is ready for an import only once its row has reached the server.
 */
const syncedProjectId = async (sql: Sql, name: string): Promise<string> => {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		const rows = await sql<{ id: string }[]>`
			select id from projects where user_id = ${SHOWCASE_USER_ID} and name = ${name}
		`;
		const row = rows[0];
		if (row) return row.id;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`The project "${name}" did not sync to the server within 30 seconds.`);
};

const createProject = async (sql: Sql, page: Page, name: string): Promise<string> => {
	await page.getByRole('button', { name: 'New project' }).first().click();
	await page.getByLabel('Project name').fill(name);
	await page.getByRole('button', { name: 'Create', exact: true }).click();
	await page.locator('a[href^="/projects/"]', { hasText: name }).first().waitFor();
	return syncedProjectId(sql, name);
};

interface ImportReport {
	readonly failed: readonly { readonly path: string; readonly message: string }[];
}

const importNotes = async (
	page: Page,
	baseUrl: string,
	projectId: string,
	files: Readonly<Record<string, string>>
): Promise<void> => {
	const response = await page.request.post(`${baseUrl}/api/imports`, {
		headers: { origin: baseUrl },
		multipart: {
			projectId,
			archive: { name: 'showcase.zip', mimeType: 'application/zip', buffer: archiveFor(files) }
		}
	});
	if (!response.ok())
		throw new Error(`Importing notes failed with ${response.status()}: ${await response.text()}`);
	const report: ImportReport = await response.json();
	if (report.failed.length > 0)
		throw new Error(
			`Importing notes failed: ${report.failed.map((entry) => `${entry.path}: ${entry.message}`).join('; ')}`
		);
};

const noteId = async (sql: Sql, title: string): Promise<string> => {
	const rows = await sql<{ id: string }[]>`
		select id from notes where user_id = ${SHOWCASE_USER_ID} and title = ${title}
	`;
	const row = rows[0];
	if (!row) throw new Error(`The seeded note "${title}" was not imported.`);
	return row.id;
};

const builtInSkillId = async (sql: Sql, name: string): Promise<string> => {
	const rows = await sql<{ id: string }[]>`
		select id from notes
		where user_id = ${SHOWCASE_USER_ID} and kind = 'skill' and title = ${name}
	`;
	const row = rows[0];
	if (!row) throw new Error(`The built-in "${name}" skill was not provisioned on first load.`);
	return row.id;
};

const daysFromToday = (days: number): string => {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return date.toISOString().slice(0, 10);
};

interface SeedTodo {
	readonly title: string;
	readonly status: 'backlog' | 'open' | 'in_progress' | 'done';
	readonly responsibility: 'mine' | 'waiting_on';
	readonly waitingOn: string | null;
	readonly due: number | null;
	readonly priority: 'low' | 'medium' | 'high' | null;
	readonly category: string;
}

const todos: readonly SeedTodo[] = [
	{
		title: 'Send revised logo files to the print shop',
		status: 'open',
		responsibility: 'mine',
		waitingOn: null,
		due: -2,
		priority: 'high',
		category: 'Identity'
	},
	{
		title: 'Approve the homepage hero copy',
		status: 'in_progress',
		responsibility: 'mine',
		waitingOn: null,
		due: 0,
		priority: 'high',
		category: 'Copy'
	},
	{
		title: 'Brief the photographer on the team shots',
		status: 'open',
		responsibility: 'mine',
		waitingOn: null,
		due: 0,
		priority: 'medium',
		category: 'Photography'
	},
	{
		title: 'Legal sign-off on trademark usage',
		status: 'open',
		responsibility: 'waiting_on',
		waitingOn: 'Legal — trademark review',
		due: 4,
		priority: 'high',
		category: 'Legal'
	},
	{
		title: 'Final colour tokens after the contrast audit',
		status: 'open',
		responsibility: 'waiting_on',
		waitingOn: 'Dana — design',
		due: 6,
		priority: 'medium',
		category: 'Identity'
	},
	{
		title: 'Draft the press kit outline',
		status: 'backlog',
		responsibility: 'mine',
		waitingOn: null,
		due: null,
		priority: 'low',
		category: 'Launch'
	},
	{
		title: 'Decide on the mobile app icon',
		status: 'backlog',
		responsibility: 'mine',
		waitingOn: null,
		due: 10,
		priority: 'medium',
		category: 'Identity'
	},
	{
		title: 'Pricing page copy',
		status: 'in_progress',
		responsibility: 'mine',
		waitingOn: null,
		due: 3,
		priority: 'medium',
		category: 'Copy'
	},
	{
		title: 'Competitor review',
		status: 'done',
		responsibility: 'mine',
		waitingOn: null,
		due: null,
		priority: null,
		category: 'Research'
	},
	{
		title: 'Kickoff with the leadership team',
		status: 'done',
		responsibility: 'mine',
		waitingOn: null,
		due: null,
		priority: null,
		category: 'Launch'
	}
];

const memory = [
	{ type: 'decision', content: 'Launch is fixed for 3 November. Scope moves; the date does not.' },
	{ type: 'constraint', content: 'Legal reviews all customer-facing copy before it ships.' },
	{
		type: 'preference',
		content: 'Plain British English in product copy, and no exclamation marks.'
	},
	{ type: 'fact', content: 'Priya Shah at Northbound Studio owns the wordmark files.' }
] as const;

const seedTodos = async (
	sql: Sql,
	projectId: string,
	linkedNoteId: string
): Promise<readonly string[]> => {
	const ids: string[] = [];
	for (const todo of todos) {
		const [row] = await sql<{ id: string }[]>`
			insert into todos (
				user_id, project_id, title, status, responsibility, waiting_on, due_date,
				priority, category, linked_note_id, completed_at
			) values (
				${SHOWCASE_USER_ID}, ${projectId}, ${todo.title}, ${todo.status},
				${todo.responsibility}, ${todo.waitingOn},
				${todo.due === null ? null : daysFromToday(todo.due)}, ${todo.priority},
				${todo.category}, ${linkedNoteId},
				${todo.status === 'done' ? sql`now() - interval '9 days'` : null}
			)
			returning id
		`;
		if (!row) throw new Error(`The todo "${todo.title}" was not inserted.`);
		ids.push(row.id);
	}
	return ids;
};

const seedMemory = async (sql: Sql, projectId: string): Promise<void> => {
	for (const entry of memory)
		await sql`
			insert into memory_entries (user_id, project_id, content, type)
			values (${SHOWCASE_USER_ID}, ${projectId}, ${entry.content}, ${entry.type})
		`;
};

/** An MCP client the user has connected, so the MCP tab shows a token rather than nothing. */
const seedApiToken = async (sql: Sql): Promise<void> => {
	const hash = createHash('sha256').update(randomBytes(32)).digest('hex');
	await sql`
		insert into api_tokens (user_id, name, token_hash, scope, last_used_at)
		values (${SHOWCASE_USER_ID}, 'Claude Desktop', ${hash}, 'read', now() - interval '2 hours')
	`;
};

/** One tool switched off, so the Tools tab shows what a disabled tool looks like. */
const seedToolPreference = async (sql: Sql): Promise<void> => {
	await sql`
		insert into tool_preferences (user_id, tool_name, enabled)
		values (${SHOWCASE_USER_ID}, 'archive_project', false)
	`;
};

/** The model a seeded run names: this deployment's default, as a real run would record. */
export const showcaseModel = (): string => {
	const model = process.env.OPENROUTER_DEFAULT_MODEL;
	if (!model) throw new Error('OPENROUTER_DEFAULT_MODEL is required to name the seeded runs.');
	return model;
};

const conversationTitle = 'Commitments from the rebrand brief';
const closingLine =
	'Two of them are waiting on other people, so they will show under Waiting on in Today.';

/**
 * One finished agent turn, stored as the run writer stores it: an event log, a `running` row
 * at each `tool_started`, a `succeeded` row at each `tool_succeeded`, and one assistant row per
 * contiguous run of text, keyed by the cursor of the event it began at.
 */
const seedConversation = async (
	sql: Sql,
	ids: {
		projectId: string;
		noteId: string;
		todoIds: readonly string[];
		memory: readonly { readonly id: string; readonly content: string }[];
	}
): Promise<void> => {
	const prompt = 'Pull the commitments out of this brief and put them on the board.';
	const [created, , , legal, colour] = ids.todoIds;
	if (!created || !legal || !colour) throw new Error('The seeded todos are missing.');
	const calls: readonly JournalledCall[] = [
		{
			name: 'get_note',
			input: { noteId: ids.noteId },
			output: getNoteOutput(ids.projectId, ids.noteId, 'Rebrand brief')
		},
		{
			name: 'list_project_memory',
			input: { projectId: ids.projectId },
			output: {
				entries: ids.memory.map((entry) => ({
					id: entry.id,
					content: entry.content,
					projectId: ids.projectId,
					createdAt: new Date().toISOString()
				}))
			}
		},
		{
			name: 'list_todos',
			input: { projectId: ids.projectId, noteId: ids.noteId },
			output: { todos: [] }
		},
		{
			name: 'create_todos',
			input: {
				requestId: randomUUID(),
				projectId: ids.projectId,
				todos: [
					{ title: 'Send revised logo files to the print shop', responsibility: 'mine' },
					{
						title: 'Legal sign-off on trademark usage',
						responsibility: 'waiting_on',
						waitingOn: 'Legal — trademark review'
					},
					{
						title: 'Final colour tokens after the contrast audit',
						responsibility: 'waiting_on',
						waitingOn: 'Dana — design'
					}
				]
			},
			output: {
				todos: [
					{ todoId: created, title: 'Send revised logo files to the print shop', status: 'open' },
					{ todoId: legal, title: 'Legal sign-off on trademark usage', status: 'open' },
					{ todoId: colour, title: 'Final colour tokens after the contrast audit', status: 'open' }
				]
			}
		}
	];
	const opening = 'I will read the brief and check what is already on the board first.';
	const answer = [
		'The brief makes three commitments that were not on the board yet, so I added them:',
		'',
		'- **Send revised logo files to the print shop** — yours.',
		'- **Legal sign-off on trademark usage** — waiting on Legal.',
		'- **Final colour tokens after the contrast audit** — waiting on Dana.',
		'',
		closingLine
	].join('\n');

	await journalRun(sql, {
		userId: SHOWCASE_USER_ID,
		projectId: ids.projectId,
		noteId: ids.noteId,
		title: conversationTitle,
		prompt,
		startedAt: new Date(Date.now() - 3 * 60 * 1000),
		model: showcaseModel(),
		speech: { opening, answer },
		calls
	});
};

/**
 * Seed the showcase workspace. The page must already be signed in as the showcase user and
 * have loaded once, which is what provisions the Inbox and the built-in skills.
 */
export const seedShowcase = async (sql: Sql, page: Page, baseUrl: string): Promise<ShowcaseIds> => {
	const projectIds = new Map<string, string>();
	for (const [name, files] of Object.entries(projects)) {
		const projectId = await createProject(sql, page, name);
		await importNotes(page, baseUrl, projectId, files);
		projectIds.set(name, projectId);
	}
	const projectId = projectIds.get(PRIMARY_PROJECT);
	if (!projectId) throw new Error(`The "${PRIMARY_PROJECT}" project was not created.`);
	const briefNoteId = await noteId(sql, 'Rebrand brief');
	const architectureNoteId = await noteId(sql, 'Launch architecture');
	await sql`
		update notes set is_pinned = true
		where user_id = ${SHOWCASE_USER_ID} and title in ('Rebrand brief', 'Launch checklist')
	`;
	const todoIds = await seedTodos(sql, projectId, briefNoteId);
	await seedMemory(sql, projectId);
	await seedApiToken(sql);
	await seedToolPreference(sql);
	const memoryEntries = await sql<{ id: string; content: string }[]>`
		select id, content from memory_entries
		where user_id = ${SHOWCASE_USER_ID} and project_id = ${projectId}
		order by created_at
	`;
	await seedConversation(sql, { projectId, noteId: briefNoteId, todoIds, memory: memoryEntries });
	await seedReadingHistory(sql, {
		userId: SHOWCASE_USER_ID,
		projectId,
		model: showcaseModel(),
		notes: (title) => noteId(sql, title),
		memory: async () => memoryEntries,
		skills: (name) => builtInSkillId(sql, name)
	});
	return {
		projectId,
		briefNoteId,
		architectureNoteId,
		diagrammingSkillId: await builtInSkillId(sql, 'Diagramming'),
		conversationTitle,
		closingLine
	};
};
