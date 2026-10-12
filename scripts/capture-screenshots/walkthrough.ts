import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Browser, Page } from '@playwright/test';
import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import type { Sql } from 'postgres';
import { APPLICATION_DEFAULTS } from '../../src/lib/server/config.ts';
import { journalRun, type JournalledCall, type JournalledIds, type JsonObject } from './journal.ts';

/**
 * The README walkthrough: one project, "Docs site relaunch", followed through five moments.
 *
 *   1. context    — a planning note, the launch brief as a PDF, two memories and two todos
 *   2. agent acts — one request writes a release plan, seven todos, a Word brief and a memory
 *   3. promise    — a sentence the user typed, with the todo Extract promises proposed for it
 *   4. proposal   — the agent proposes a simulator widget, waiting for approval
 *   5. result     — the widget is approved, embedded in the note, and moved to 12 days
 *
 * Each moment is a state of the same data, so the walkthrough seeds moment 1 and advances one
 * moment at a time between captures. Dates count from the Monday of the capture week, so the
 * plan never shows as overdue in a later run.
 */

export type WalkthroughMoment = 1 | 2 | 3 | 4 | 5;

export interface WalkthroughIds {
	readonly projectId: string;
	readonly planningNoteId: string;
	/** The release plan the agent writes. It exists from moment 2. */
	readonly releasePlanNoteId: () => string;
}

export interface WalkthroughScope {
	readonly userId: string;
	readonly model: string;
	readonly baseUrl: string;
	readonly browser: Browser;
	readonly createProject: (name: string) => Promise<string>;
	readonly importNotes: (
		projectId: string,
		files: Readonly<Record<string, string>>
	) => Promise<void>;
	readonly noteId: (title: string) => Promise<string>;
}

const PROJECT = 'Docs site relaunch';
const PROMISE = 'I will verify every redirect on staging before Thursday.';

// ── Dates ──────────────────────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

/** The Monday the plan starts on: today if today is a Monday, otherwise the next one. */
const planStart = (now: Date): Date => {
	const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
	const toMonday = (8 - date.getUTCDay()) % 7;
	return new Date(date.getTime() + toMonday * DAY);
};

/** Working day `n` of the plan, counting the start Monday as day 1. */
const workday = (start: Date, n: number): Date => {
	const weeks = Math.floor((n - 1) / 5);
	const weekday = (n - 1) % 5;
	return new Date(start.getTime() + (weeks * 7 + weekday) * DAY);
};

const short = (date: Date): string =>
	date.toLocaleDateString('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});
/** "Friday 13 November 2026": `toLocaleDateString` puts a comma after the weekday. */
const long = (date: Date): string => {
	const part = (options: Intl.DateTimeFormatOptions): string =>
		date.toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' });
	return `${part({ weekday: 'long' })} ${part({ day: 'numeric' })} ${part({ month: 'long' })} ${part({ year: 'numeric' })}`;
};
const iso = (date: Date): string => date.toISOString().slice(0, 10);

/** The plan's schedule in working days. Launch is a Friday five weeks after the start. */
const schedule = (start: Date) => ({
	start,
	design: { from: workday(start, 1), to: workday(start, 4) },
	build: { from: workday(start, 5), to: workday(start, 11) },
	qa: { from: workday(start, 12), to: workday(start, 14) },
	copy: { from: workday(start, 1), to: workday(start, 5) },
	legal: { from: workday(start, 6), to: workday(start, 9) },
	launch: workday(start, 25),
	/** "before Thursday": the Thursday of the first week. */
	promiseDue: workday(start, 4)
});

type Schedule = ReturnType<typeof schedule>;

// ── Content ────────────────────────────────────────────────────────────────────────────────

const planningNotes = (plan: Schedule): string => `## Scope

Move the docs site to the new design system and a simpler navigation. Launch target: ${long(plan.launch).replace(/ \d{4}$/, '')}.

## Decisions

- Keep the current URL structure where we can. Every moved page gets a 301 redirect.
- Legal approves the new privacy and cookie copy before launch.
- No new features in this release. Search improvements wait for the next one.

## Owners

- Design: Maya
- Build: Tom
- Copy: Priya
- Legal review: Daniel

## Schedule

Two workstreams. Both must finish before launch.

- Development: design sign-off (4 days), then build (7 days), then QA (3 days).
- Content: copywriting (5 days), then legal review (4 days).
`;

const launchBrief = (plan: Schedule): string => `# Docs site relaunch: launch brief

Prepared for the docs, design and legal teams · Version 2

## Why we are relaunching

Readers cannot find the setup guides. Search traffic lands on pages that are three releases old, and the navigation has grown to 140 top-level links. The relaunch moves the site to the new design system and cuts the navigation to six sections.

## Goals

- A new reader finds the setup guide in under two clicks.
- No broken links: every moved page redirects to its new address.
- The site passes an accessibility review at WCAG 2.2 AA.

## Requirements

- The homepage, setup guide and API overview get new copy.
- Legal approves the privacy notice and cookie banner before they go live.
- QA signs off on the staging site, including redirects, before launch.
- Analytics events stay the same, so we can compare before and after.

## Out of scope

New search, versioned docs and translations wait for a later release.

## Launch

Target launch date: **${long(plan.launch).replace(/ \d{4}$/, '')}**. The launch needs legal approval and a completed QA pass. If either is late, the launch moves.
`;

/**
 * The release plan the agent writes, after the user's own edit: QA moved from 3 to 5 days, and
 * the promise sentence under the risks. `agentWrote` is the version the agent saved.
 */
const releasePlan = (
	plan: Schedule,
	agentWrote: boolean
): string => `# Release plan — Docs site relaunch

## Scope

Move the docs site to the new design system and a simpler navigation. Launch target: **${long(plan.launch)}**.

## Decisions

- Keep the current URL structure where we can. Every moved page gets a 301 redirect.
- Legal approves the new privacy and cookie copy before launch.
- No new features in this release. Search improvements wait for the next one.

## Owners

| Role | Person |
|------|--------|
| Design | Maya |
| Build | Tom |
| Copy | Priya |
| Legal review | Daniel |

## Workstreams

Two parallel workstreams. Both must finish before launch.

### Development stream

1. **Design sign-off** — 4 days (owner: Maya)
2. **Build** — 7 days (owner: Tom)
3. **QA** — ${agentWrote ? 3 : 5} days

### Content stream

1. **Copywriting** — 5 days (owner: Priya)
2. **Legal review** — 4 days (owner: Daniel)

## Schedule

All dates are working days, starting ${long(plan.start)}.

| Task | Owner | Start | End | Days |
|------|-------|-------|-----|------|
| Design sign-off | Maya | ${short(plan.design.from)} | ${short(plan.design.to)} | 4 |
| Build | Tom | ${short(plan.build.from)} | ${short(plan.build.to)} | 7 |
| QA | Team | ${short(plan.qa.from)} | ${short(plan.qa.to)} | 3 |
| Copywriting | Priya | ${short(plan.copy.from)} | ${short(plan.copy.to)} | 5 |
| Legal review | Daniel | ${short(plan.legal.from)} | ${short(plan.legal.to)} | 4 |
| **Launch** | **Team** | | **${short(plan.launch)}** | |

## Risks

- **Hard gate:** Both workstreams must be complete before launch. If legal approval or QA is late, the launch moves.
- **Redirect accuracy:** Every moved page needs a verified 301 redirect — omitted redirects will break existing links.
${agentWrote ? '' : `\n${PROMISE}\n`}
## Key deliverables

- New design system applied to docs site
- Simplified navigation structure
- Updated privacy and cookie copy (legal-approved)
- 301 redirect map for all moved pages
- QA sign-off
`;

const agentTodos = (plan: Schedule) =>
	[
		{
			title: 'Design sign-off — apply new design system to docs site',
			waitingOn: 'Maya',
			due: plan.design.to
		},
		{
			title: 'Build — implement new design system and navigation',
			waitingOn: 'Tom',
			due: plan.build.to
		},
		{ title: 'QA — test the relaunched docs site', waitingOn: null, due: plan.qa.to },
		{
			title: 'Copywriting — write new privacy and cookie copy',
			waitingOn: 'Priya',
			due: plan.copy.to
		},
		{
			title: 'Legal review — approve privacy and cookie copy',
			waitingOn: 'Daniel',
			due: plan.legal.to
		},
		{ title: 'Set up 301 redirect map for moved pages', waitingOn: null, due: plan.qa.to },
		{ title: 'Launch — deploy relaunched docs site', waitingOn: null, due: plan.launch }
	] as const;

const memoryProposal = (plan: Schedule): string =>
	`Launch target for the Docs site relaunch is ${long(plan.launch)}. Schedule: design sign-off (4 days, Maya), build (7 days, Tom), QA (3 days); copywriting (5 days, Priya), legal review (4 days, Daniel). Development and content workstreams run in parallel; both must finish before launch.`;

// ── Storage ────────────────────────────────────────────────────────────────────────────────

/** The bucket the app stores attachments and exports in, read the way the app reads it. */
const storage = () => {
	const setting = (key: keyof typeof APPLICATION_DEFAULTS): string =>
		process.env[key] ?? APPLICATION_DEFAULTS[key];
	const client = new S3Client({
		endpoint: setting('S3_ENDPOINT'),
		region: setting('S3_REGION'),
		forcePathStyle: setting('S3_FORCE_PATH_STYLE') === 'true',
		credentials: {
			accessKeyId: setting('S3_ACCESS_KEY_ID'),
			secretAccessKey: setting('S3_SECRET_ACCESS_KEY')
		}
	});
	const bucket = setting('S3_BUCKET');
	return {
		put: async (key: string, body: Uint8Array, contentType: string): Promise<void> => {
			await client.send(
				new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
			);
		},
		downloadUrl: (key: string): Promise<string> =>
			getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 })
	};
};

/** The launch brief as a real PDF: printed from its text by the browser the capture runs. */
const briefPdf = async (browser: Browser, markdown: string): Promise<Uint8Array> => {
	const html = markdown
		.split('\n\n')
		.map((block) => {
			const inline = block.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
			if (inline.startsWith('# ')) return `<h1>${inline.slice(2)}</h1>`;
			if (inline.startsWith('## ')) return `<h2>${inline.slice(3)}</h2>`;
			if (inline.startsWith('- '))
				return `<ul>${inline
					.split('\n')
					.map((item) => `<li>${item.slice(2)}</li>`)
					.join('')}</ul>`;
			return `<p>${inline}</p>`;
		})
		.join('');
	const page = await browser.newPage();
	await page.setContent(
		`<body style="font-family: Georgia, serif; margin: 48px; line-height: 1.5">${html}</body>`
	);
	const pdf = await page.pdf({ format: 'A4' });
	await page.close();
	return pdf;
};

/** The Word brief `export_document` produces from the release plan. */
const releasePlanDocx = async (plan: Schedule): Promise<Uint8Array> => {
	const paragraphs = releasePlan(plan, true)
		.split('\n')
		.filter((line) => line.trim() !== '' && !line.startsWith('|'))
		.map((line) => {
			if (line.startsWith('# '))
				return new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 });
			if (line.startsWith('## '))
				return new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 });
			if (line.startsWith('### '))
				return new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 });
			return new Paragraph({ text: line.replace(/\*\*/g, '').replace(/^(- |\d\. )/, '') });
		});
	return Packer.toBuffer(new Document({ sections: [{ children: paragraphs }] }));
};

// ── Moments ────────────────────────────────────────────────────────────────────────────────

const widgetTemplate = async (plan: Schedule): Promise<JsonObject> => {
	const template: { title: string; catalogVersion: number; layout: JsonObject } = JSON.parse(
		(await readFile(new URL('./walkthrough-widget.json', import.meta.url), 'utf8')).replaceAll(
			'{{start}}',
			short(plan.start)
		)
	);
	return template.layout;
};

const WIDGET_TITLE = 'Critical-Path Simulator';

/**
 * Seed moment 1 and return a walkthrough that advances the same data to later moments. Each
 * call to `advanceTo` applies the moments between the current one and the target, in order.
 */
export const seedWalkthrough = async (sql: Sql, scope: WalkthroughScope) => {
	const plan = schedule(planStart(new Date()));
	const bucket = storage();
	const userId = scope.userId;

	// Moment 1: what the user already has.
	const projectId = await scope.createProject(PROJECT);
	await sql`update projects set section_numbering_default = true where id = ${projectId}`;
	await scope.importNotes(projectId, { 'Planning notes.md': planningNotes(plan) });
	const planningNoteId = await scope.noteId('Planning notes');
	const brief = launchBrief(plan);
	const pdf = await briefPdf(scope.browser, brief);
	const versionId = randomUUID();
	const objectKey = `objects/${userId}/${projectId}/${versionId}`;
	await bucket.put(objectKey, pdf, 'application/pdf');
	await sql.begin(async (tx) => {
		const [attachment] = await tx<{ id: string }[]>`
			insert into attachments (user_id, project_id, path)
			values (${userId}, ${projectId}, 'Launch brief.pdf')
			returning id
		`;
		if (!attachment) throw new Error('The launch brief attachment was not inserted.');
		await tx`
			insert into attachment_versions (
				id, attachment_id, object_key, media_type, byte_size, checksum_sha256,
				parser_kind, extracted_text, processing_status, processed_at
			) values (
				${versionId}, ${attachment.id}, ${objectKey}, 'application/pdf', ${pdf.byteLength},
				${createHash('sha256').update(pdf).digest('hex')}, 'ocr', ${brief}, 'ready', now()
			)
		`;
		await tx`update attachments set current_version_id = ${versionId} where id = ${attachment.id}`;
	});
	for (const [type, content] of [
		[
			'constraint',
			'The launch needs legal approval and a completed QA pass. If either is late, the launch moves.'
		],
		['decision', 'Every moved page keeps a 301 redirect from its old URL.']
	] as const)
		await sql`
			insert into memory_entries (user_id, project_id, content, type)
			values (${userId}, ${projectId}, ${content}, ${type})
		`;
	for (const title of ['Finalise the homepage design', 'Collect screenshots for the setup guide'])
		await sql`
			insert into todos (user_id, project_id, title, status, responsibility)
			values (${userId}, ${projectId}, ${title}, 'open', 'mine')
		`;

	let releasePlanNoteId: string | undefined;
	let widgetRun: JournalledIds | undefined;
	let moment: WalkthroughMoment = 1;
	const startedAt = (minutesAgo: number): Date => new Date(Date.now() - minutesAgo * 60 * 1000);
	const prompt =
		'Read the launch brief and these planning notes. Write a release plan note, add the outstanding launch tasks to the board, and export the release plan as a Word brief for the team.';
	const widgetPrompt =
		'Build an interactive critical-path simulator for this launch plan. Use the stages and durations in this note. Let me change each stage with a slider and show which workstream sets the launch date. Embed it in this note.';

	const moments: Record<Exclude<WalkthroughMoment, 1>, () => Promise<void>> = {
		// Moment 2: one request, and everything it produced.
		2: async () => {
			await scope.importNotes(projectId, { 'Release plan.md': releasePlan(plan, false) });
			const noteId = await scope.noteId('Release plan');
			releasePlanNoteId = noteId;
			const todos = agentTodos(plan);
			const todoIds: string[] = [];
			for (const todo of todos) {
				const [row] = await sql<{ id: string }[]>`
					insert into todos (
						user_id, project_id, title, status, responsibility, waiting_on, due_date,
						linked_note_id
					) values (
						${userId}, ${projectId}, ${todo.title}, 'open',
						${todo.waitingOn ? 'waiting_on' : 'mine'}, ${todo.waitingOn}, ${iso(todo.due)},
						${noteId}
					)
					returning id
				`;
				if (!row) throw new Error(`The todo "${todo.title}" was not inserted.`);
				todoIds.push(row.id);
			}
			const docx = await releasePlanDocx(plan);
			const artifactId = randomUUID();
			const artifactKey = `artifacts/${userId}/${artifactId}.docx`;
			await bucket.put(
				artifactKey,
				docx,
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
			);
			const [exportProvenance] = await sql<{ id: string }[]>`
				insert into provenance (user_id, producer_kind, producer_name)
				values (${userId}, 'user', 'document-export')
				returning id
			`;
			const [artifact] = await sql<{ id: string; created_at: Date }[]>`
				insert into artifacts (
					id, user_id, project_id, title, format, object_key, byte_size, source_note_ids,
					provenance_id
				) values (
					${artifactId}, ${userId}, ${projectId}, 'Release plan — Docs site relaunch', 'docx',
					${artifactKey}, ${docx.byteLength}, ${sql.json([noteId])}, ${exportProvenance?.id ?? null}
				)
				returning id, created_at
			`;
			if (!artifact || !exportProvenance) throw new Error('The Word export was not inserted.');
			const memoryPayload = {
				scope: 'project',
				content: memoryProposal(plan),
				operation: 'add',
				projectId,
				justification:
					'Permanent schedule and launch date derived from the planning notes to inform future conversations.'
			};
			const runId = randomUUID();
			const [memoryProvenance] = await sql<{ id: string }[]>`
				insert into provenance (user_id, producer_kind, producer_name, pipeline, run_id, model)
				values (
					${userId}, 'agent', 'FollowThrough Workbench Agent', 'agent', ${runId}, ${scope.model}
				)
				returning id
			`;
			if (!memoryProvenance) throw new Error('The memory proposal provenance was not inserted.');
			const [suggestion] = await sql<{ id: string; created_at: Date }[]>`
				insert into suggestions (user_id, kind, status, payload, confidence, provenance_id)
				values (
					${userId}, 'memory', 'proposed', ${sql.json(memoryPayload)}, 90, ${memoryProvenance.id}
				)
				returning id, created_at
			`;
			if (!suggestion) throw new Error('The memory proposal was not inserted.');
			const calls: JournalledCall[] = [
				{
					name: 'get_note',
					input: { noteId: planningNoteId },
					output: {
						noteId: planningNoteId,
						title: 'Planning notes',
						etag: `note:${planningNoteId}:r1`,
						body: {
							kind: 'file',
							file: {
								kind: 'file',
								path: `/projects/${projectId}/notes/${planningNoteId}.md`,
								mediaType: 'text/markdown'
							}
						},
						todos: [],
						diagrams: [],
						backlinks: [],
						references: [],
						pendingSuggestions: []
					}
				},
				{
					name: 'create_note',
					input: { title: 'Release plan', projectId },
					output: { title: 'Release plan', noteId, currentRevision: 1 }
				},
				{
					name: 'save_note',
					input: { noteId, markdown: releasePlan(plan, true) },
					output: { title: 'Release plan', noteId, currentRevision: 2 }
				},
				{
					name: 'create_todos',
					input: {
						requestId: randomUUID(),
						projectId,
						todos: todos.map((todo) => ({
							title: todo.title,
							dueDate: iso(todo.due),
							responsibility: todo.waitingOn ? 'waiting_on' : 'mine',
							...(todo.waitingOn ? { waitingOn: todo.waitingOn } : {})
						}))
					},
					output: {
						todos: todos.map((todo, index) => ({
							title: todo.title,
							status: 'open',
							todoId: todoIds[index] ?? ''
						}))
					}
				},
				{
					name: 'export_document',
					input: {
						title: 'Release plan — Docs site relaunch',
						format: 'docx',
						noteIds: [noteId],
						projectId
					},
					output: {
						artifact: {
							id: artifactId,
							title: 'Release plan — Docs site relaunch',
							format: 'docx',
							userId,
							byteSize: docx.byteLength,
							createdAt: artifact.created_at.toISOString(),
							objectKey: artifactKey,
							projectId,
							provenanceId: exportProvenance.id,
							sourceNoteIds: [noteId]
						},
						downloadUrl: await bucket.downloadUrl(artifactKey)
					}
				},
				{
					name: 'propose_memory_change',
					input: {
						scope: 'project',
						operation: 'add',
						projectId,
						content: memoryProposal(plan),
						confidence: 90
					},
					output: {
						suggestion: {
							id: suggestion.id,
							kind: 'memory',
							status: 'proposed',
							userId,
							payload: memoryPayload,
							createdAt: suggestion.created_at.toISOString(),
							updatedAt: suggestion.created_at.toISOString(),
							confidence: 90,
							provenanceId: memoryProvenance.id,
							isAutoAccepted: false
						}
					}
				}
			];
			await journalRun(sql, {
				runId,
				userId,
				projectId,
				noteId: planningNoteId,
				title: prompt,
				prompt,
				startedAt: startedAt(40),
				model: scope.model,
				opening:
					'I will read the planning notes and the launch brief, then write the plan, add the tasks and export it.',
				calls,
				ending: {
					kind: 'answered',
					answer: `Done. The **Release plan** note is written, seven launch tasks are on the board with owners and dates, and the Word brief is exported. I also proposed saving the launch date and schedule to project memory, so later chats start with them.`
				}
			});
		},
		// Moment 3: the user's own line, and the todo Extract promises proposes for it.
		3: async () => {
			const noteId = releasePlanNoteId;
			if (!noteId) throw new Error('Moment 3 needs the release plan from moment 2.');
			const [note] = await sql<{ plain_text: string; current_revision: number }[]>`
				select plain_text, current_revision from notes where id = ${noteId}
			`;
			const from = note?.plain_text.indexOf(PROMISE) ?? -1;
			if (!note || from < 0) throw new Error('The release plan does not contain the promise.');
			await sql.begin(async (tx) => {
				const [anchor] = await tx<{ id: string }[]>`
					insert into source_anchors (note_id, from_offset, to_offset, quote, revision)
					values (${noteId}, ${from}, ${from + PROMISE.length}, ${PROMISE}, ${note.current_revision})
					returning id
				`;
				if (!anchor) throw new Error('The promise anchor was not inserted.');
				const [provenance] = await tx<{ id: string }[]>`
					insert into provenance (user_id, producer_kind, producer_name, pipeline, source_anchor_id)
					values (${userId}, 'pipeline', 'Extract Promises', 'extract_promises', ${anchor.id})
					returning id
				`;
				if (!provenance) throw new Error('The promise provenance was not inserted.');
				await tx`
					insert into suggestions (
						user_id, note_id, kind, status, payload, confidence, provenance_id, source_anchor_id
					) values (
						${userId}, ${noteId}, 'todo', 'proposed',
						${tx.json({
							title: 'verify every redirect on staging',
							dueDate: iso(plan.promiseDue),
							projectId,
							provenanceId: provenance.id,
							responsibility: 'mine',
							sourceAnchorId: anchor.id,
							dueDateVerbatim: 'before Thursday',
							promiseStrength: 'explicit'
						})},
						1, ${provenance.id}, ${anchor.id}
					)
				`;
			});
		},
		// Moment 4: the user accepted the todo; the agent proposes a widget and waits.
		4: async () => {
			const noteId = releasePlanNoteId;
			if (!noteId) throw new Error('Moment 4 needs the release plan from moment 2.');
			const [todo] = await sql<{ id: string }[]>`
				insert into todos (
					user_id, project_id, title, status, responsibility, due_date, due_date_verbatim,
					promise_strength, linked_note_id
				) values (
					${userId}, ${projectId}, 'verify every redirect on staging', 'open', 'mine',
					${iso(plan.promiseDue)}, 'before Thursday', 'explicit', ${noteId}
				)
				returning id
			`;
			if (!todo) throw new Error('The accepted promise todo was not inserted.');
			await sql`
				update suggestions
				set status = 'accepted', decided_at = now(), applied_artifact_type = 'todo',
					applied_artifact_id = ${todo.id}, updated_at = now()
				where user_id = ${userId} and kind = 'todo' and note_id = ${noteId}
			`;
			widgetRun = await journalRun(sql, {
				runId: randomUUID(),
				userId,
				projectId,
				noteId,
				title: widgetPrompt,
				prompt: widgetPrompt,
				startedAt: startedAt(5),
				model: scope.model,
				opening:
					'I will build the simulator from the stages and durations in this note. QA is now 5 days.',
				calls: [],
				ending: {
					kind: 'awaiting_approval',
					call: {
						name: 'create_widget',
						input: {
							title: WIDGET_TITLE,
							projectId,
							noteId,
							layout: JSON.stringify(await widgetTemplate(plan)),
							data: JSON.stringify({
								designSignoff: 4,
								build: 7,
								qa: 5,
								copywriting: 5,
								legalReview: 4
							})
						}
					}
				}
			});
		},
		// Moment 5: approved, embedded, and moved: Legal review at 12 days.
		5: async () => {
			const noteId = releasePlanNoteId;
			if (!noteId || !widgetRun)
				throw new Error('Moment 5 needs the release plan and the widget proposal from moment 4.');
			const layout = await widgetTemplate(plan);
			const [widget] = await sql<{ id: string }[]>`
				insert into widgets (user_id, project_id, title, catalog_version, layout, data)
				values (
					${userId}, ${projectId}, ${WIDGET_TITLE}, 3, ${sql.json(layout)},
					${sql.json({ designSignoff: 4, build: 7, qa: 5, copywriting: 5, legalReview: 12 })}
				)
				returning id
			`;
			if (!widget) throw new Error('The widget was not inserted.');
			// The agent embedded it under its own heading, before the risks, as `edit_note` does.
			const [note] = await sql<{ document: { content: JsonObject[] }; plain_text: string }[]>`
				select document, plain_text from notes where id = ${noteId}
			`;
			if (!note) throw new Error('The release plan note is missing.');
			const risks = note.document.content.findIndex(
				(node) => JSON.stringify(node).includes('"Risks"') && node.type === 'heading'
			);
			if (risks < 0) throw new Error('The release plan has no Risks heading to embed above.');
			const content = [
				...note.document.content.slice(0, risks),
				{
					// The same attributes the importer gave the neighbouring level-2 heading.
					...note.document.content[risks],
					content: [{ type: 'text', text: 'Interactive simulator' }]
				},
				{ type: 'widgetNode', attrs: { widgetId: widget.id } },
				...note.document.content.slice(risks)
			];
			await sql`
				update notes
				set document = ${sql.json({ ...note.document, content })},
					plain_text = ${note.plain_text.replace('Risks', 'Interactive simulator\n\nRisks')},
					current_revision = current_revision + 1, updated_at = now()
				where id = ${noteId}
			`;
			await sql`delete from conversations where id = ${widgetRun.conversationId}`;
			const embed = `:::widgetNode {widgetId='${widget.id}'} :::`;
			await journalRun(sql, {
				runId: randomUUID(),
				userId,
				projectId,
				noteId,
				title: widgetPrompt,
				prompt: widgetPrompt,
				startedAt: startedAt(5),
				model: scope.model,
				opening:
					'I will build the simulator from the stages and durations in this note. QA is now 5 days.',
				calls: [
					{
						name: 'create_widget',
						input: {},
						output: { embed, title: WIDGET_TITLE, widgetId: widget.id }
					},
					{
						name: 'edit_note',
						input: {},
						output: { title: 'Release plan', noteId, appliedEdits: 1, currentRevision: 3 }
					}
				],
				ending: {
					kind: 'answered',
					answer:
						'The **Critical-Path Simulator** is in the Release plan, under its own heading before the risks. Move a slider and it shows which workstream sets the launch date.'
				}
			});
		}
	};

	const ids: WalkthroughIds = {
		projectId,
		planningNoteId,
		releasePlanNoteId: () => {
			if (!releasePlanNoteId) throw new Error('The release plan exists from moment 2.');
			return releasePlanNoteId;
		}
	};
	return {
		ids,
		advanceTo: async (target: WalkthroughMoment): Promise<void> => {
			if (target < moment)
				throw new Error(`The walkthrough is at moment ${moment} and cannot go back to ${target}.`);
			while (moment < target) {
				const next = (moment + 1) as Exclude<WalkthroughMoment, 1>;
				await moments[next]();
				moment = next;
			}
		}
	};
};

export type Walkthrough = Awaited<ReturnType<typeof seedWalkthrough>>;
