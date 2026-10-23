import { setTimeout as sleep } from 'node:timers/promises';
import type { Locator, Page } from '@playwright/test';
import type { Sql } from 'postgres';
import type { ScriptedTurn } from '../capture-screenshots/journal.ts';
import type { ShowcaseIds } from '../capture-screenshots/showcase.ts';
import { fulfillRemote, runningSnapshot } from './remote.ts';
import type { ClipRecorder, Hand } from './recorder.ts';
import type { ParkedCall, ReplayOutcome, ReplayReceipt, RunReplay } from './replay.ts';

/**
 * The five beats of the README walkthrough, as one continuous session in the real app. Each beat
 * is recorded as its own clip; the page is never reloaded between them, so the chat panel, the
 * open note and the pointer carry over exactly as a reader would see them.
 */
export const beatIds = [
	'context',
	'agent-acts',
	'extract-promise',
	'widget-proposal',
	'widget-result'
] as const;
export type BeatId = (typeof beatIds)[number];

export interface BeatContext {
	readonly page: Page;
	readonly hand: Hand;
	readonly recorder: ClipRecorder;
	readonly replay: RunReplay;
	readonly sql: Sql;
	readonly ids: ShowcaseIds;
	readonly userId: string;
	readonly model: string;
	readonly baseUrl: string;
}

/** What one beat leaves for the next: the widget turn parked on its approval. */
export interface FilmState {
	widget?: {
		readonly turn: ScriptedTurn;
		readonly receipt: ReplayReceipt;
		readonly parked: ParkedCall;
	};
}

export interface Beat {
	/** The README heading the beat illustrates; the composition captions it. */
	readonly caption: string;
	/** Bring the page to the clip's first frame. Not recorded. */
	readonly prepare: (context: BeatContext, state: FilmState) => Promise<void>;
	/** The recorded action. */
	readonly act: (context: BeatContext, state: FilmState) => Promise<void>;
}

const SUBMIT = '**/_app/remote/*/submitAgentRun';
const EXTRACT = '**/_app/remote/*/extractPromises';
const DECIDE = '**/_app/remote/*/decideAgentRunBatch*';

const noteBody = (page: Page): Locator =>
	page.getByRole('textbox', { name: 'Note body', exact: true });
const agentPanel = (page: Page): Locator => page.getByRole('complementary', { name: 'Agent' });

/** Wait for a value a route handler produces, since the handler runs when the page calls it. */
const produced = async <T>(read: () => T | undefined, what: string): Promise<T> => {
	for (let waited = 0; waited < 30_000; waited += 50) {
		const value = read();
		if (value !== undefined) return value;
		await sleep(50);
	}
	throw new Error(`${what} was not produced within 30 seconds.`);
};

/** Type a prompt into the composer and send it, with the replay answering the submission. */
const ask = async (
	{ page, hand, recorder, replay }: BeatContext,
	turn: ScriptedTurn
): Promise<{ receipt: ReplayReceipt; outcome: Promise<ReplayOutcome> }> => {
	let started: { receipt: ReplayReceipt; outcome: Promise<ReplayOutcome> } | undefined;
	await page.route(SUBMIT, async (route) => {
		const receipt = await replay.start(turn);
		await fulfillRemote(route, receipt);
		recorder.mark('submitted');
		started = { receipt, outcome: replay.play(turn, receipt) };
	});
	const panel = agentPanel(page);
	await hand.click(panel.locator('#chat-composer'));
	await hand.type(turn.prompt);
	await hand.pause(500);
	await hand.click(panel.getByRole('button', { name: 'Send message' }));
	recorder.mark('sent');
	const result = await produced(() => started, 'The submission');
	await page.unroute(SUBMIT);
	return result;
};

export const beats: Readonly<Record<BeatId, Beat>> = {
	context: {
		caption: 'Start with what you already have',
		prepare: async ({ page, baseUrl, ids, hand }) => {
			await page.goto(`${baseUrl}/projects/${ids.walkthrough.ids.projectId}`);
			await page.getByText('Attachments').first().waitFor();
			await page.getByRole('link', { name: 'Planning notes' }).first().waitFor();
			await page.evaluate(() => document.fonts.ready);
			await hand.rest();
		},
		act: async ({ page, hand, recorder }) => {
			await hand.pause(1200);
			await hand.click(page.getByRole('link', { name: 'Planning notes' }).first());
			await noteBody(page).getByText('Two workstreams').first().waitFor();
			recorder.mark('note-open');
			await hand.pause(1400);
			await hand.click(page.getByRole('button', { name: 'Toggle chat panel' }));
			await agentPanel(page).locator('#chat-composer').waitFor();
			recorder.mark('chat-open');
			await hand.pause(900);
		}
	},
	'agent-acts': {
		caption: 'Ask for work, not answers',
		prepare: async () => {},
		act: async (context) => {
			const { page, hand, recorder, ids } = context;
			const panel = agentPanel(page);
			const { outcome } = await ask(context, ids.walkthrough.live.releasePlanTurn());
			await outcome;
			await panel.getByText('seven launch tasks are on the board').waitFor();
			recorder.mark('answered');
			await hand.pause(1800);
			// The rows settle once the turn is done; the created note opens from its own row.
			await hand.click(
				panel.getByRole('button', { name: /^Open (note for )?Release plan in a tab$/ })
			);
			await noteBody(page).getByText('Development stream').first().waitFor();
			recorder.mark('release-plan-open');
			await hand.pause(1600);
		}
	},
	'extract-promise': {
		caption: 'Keep working yourself',
		prepare: async () => {},
		act: async ({ page, hand, recorder, replay, ids, userId, model }) => {
			const sentence = noteBody(page).getByText('I will verify every redirect on staging');
			let finishing: Promise<void> | undefined;
			await page.route(EXTRACT, async (route) => {
				const proposal = await ids.walkthrough.live.proposePromise();
				const receipt = await replay.startPromiseExtraction({
					userId,
					model,
					noteId: proposal.noteId,
					selection: proposal.selection
				});
				await fulfillRemote(route, receipt);
				recorder.mark('extract-requested');
				finishing = replay.finishPromiseExtraction(receipt, userId, proposal);
			});
			await hand.pause(600);
			await hand.scrollTo(sentence);
			await hand.pause(700);
			await hand.selectLine(sentence);
			const extract = page
				.locator('[data-selection-menu]')
				.getByRole('button', { name: 'Extract promises' });
			await extract.waitFor();
			await hand.pause(600);
			await hand.click(extract);
			await produced(() => finishing, 'The extraction');
			await finishing;
			await page.unroute(EXTRACT);
			const accept = page
				.locator('.suggestion-inline-widget')
				.getByRole('button', { name: 'Accept' });
			await accept.waitFor({ timeout: 60_000 });
			recorder.mark('proposed');
			await hand.pause(1600);
			await hand.click(accept);
			recorder.mark('accepted');
			await accept.waitFor({ state: 'hidden', timeout: 60_000 });
			await hand.pause(1400);
		}
	},
	'widget-proposal': {
		caption: 'Build on what changed',
		prepare: async () => {},
		act: async (context, state) => {
			const { page, hand, recorder, ids } = context;
			const turn = await ids.walkthrough.live.widgetProposalTurn();
			// A new request starts a new chat, as the README's fourth moment does.
			await hand.click(agentPanel(page).getByRole('button', { name: 'New chat', exact: true }));
			await agentPanel(page).getByText('Ask it to do something').waitFor();
			await hand.pause(700);
			const { receipt, outcome } = await ask(context, turn);
			const ended = await outcome;
			if (ended.kind !== 'parked') throw new Error('The widget turn did not park on its approval.');
			const approve = agentPanel(page)
				.getByRole('button', { name: 'Approve', exact: true })
				.first();
			await approve.waitFor({ timeout: 60_000 });
			await approve.scrollIntoViewIfNeeded();
			recorder.mark('proposed');
			await hand.pause(1800);
			state.widget = { turn, receipt, parked: ended.call };
		}
	},
	'widget-result': {
		caption: 'The work stays',
		prepare: async () => {},
		act: async ({ page, hand, recorder, replay, sql, ids, userId, model }, state) => {
			const widget = state.widget;
			if (!widget) throw new Error('The widget proposal beat runs before its result.');
			let resuming: Promise<void> | undefined;
			await page.route(DECIDE, async (route) => {
				await replay.approve(widget.turn);
				const [latest] = await sql<{ cursor: string }[]>`
					select max(cursor)::text as cursor from agent_run_events where run_id = ${widget.turn.runId}
				`;
				if (!latest) throw new Error('The widget run has no events to resume from.');
				await fulfillRemote(
					route,
					runningSnapshot({
						runId: widget.turn.runId,
						userId,
						conversationId: widget.receipt.conversationId,
						model,
						prompt: widget.turn.prompt,
						latestCursor: latest.cursor
					})
				);
				recorder.mark('approved');
				resuming = replay.resume(
					widget.turn,
					widget.receipt,
					widget.parked,
					ids.walkthrough.live.widgetResume()
				);
			});
			await hand.click(
				agentPanel(page).getByRole('button', { name: 'Approve', exact: true }).first()
			);
			await produced(() => resuming, 'The resumed run');
			await resuming;
			await page.unroute(DECIDE);
			recorder.mark('embedded');
			const body = noteBody(page);
			const simulator = body.getByText('Critical-Path Simulator').first();
			await simulator.waitFor({ timeout: 60_000 });
			await simulator.scrollIntoViewIfNeeded();
			await hand.pause(1800);
			await hand.dragSlider(body.getByRole('slider', { name: 'Legal review' }), 8);
			recorder.mark('legal-12');
			await body.getByText('Content stream').first().waitFor();
			await hand.pause(2600);
		}
	}
};
