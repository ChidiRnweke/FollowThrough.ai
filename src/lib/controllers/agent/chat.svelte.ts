import { readNoteReview } from '$lib/stores/agent/chat-tools';
import type {
	AgentEvent,
	AgentExecutionMode,
	AgentRunId,
	AgentRunSnapshot,
	AgentRunStatus,
	ConversationId,
	Message,
	RunAgentInput,
	StoredAgentRunEventRecord,
	StoredMessage,
	AgentRunReceipt,
	SubmitAgentRunInput
} from '$lib/models/agent';

import type { WorkspaceValues } from '$lib/models/workspace-records';

import {
	matchToolActivity,
	mergeToolActivity,
	readJournalledTool,
	readRestoredImages,
	toolArguments,
	type ChatToolActivity,
	type ChatToolActivityBase
} from '$lib/stores/agent/chat-tools';
import { appContext } from '$lib/stores/agent/app-context.svelte';
import type { ChatHandoff } from '$lib/stores/agent/chat-handoff';
import {
	STORAGE_KEY_PREFIX,
	persistedConversation,
	entryTools,
	type ChatEntry,
	type ChatHistorySource,
	type ChatPart,
	type ChatSession,
	type ChatSessionKey
} from '$lib/stores/agent/chat.svelte';
import type { ContextChips } from '$lib/services/chat/chips';
import { SvelteSet } from 'svelte/reactivity';
import type { ContextChip, MentionHistory, SelectionChip } from '$lib/models/chat';
import { createMentionHistory } from '$lib/models/chat';

// ----- Ports: the server's run functions and this tab's run bookkeeping -----

export type AgentRunSubmission =
	| { readonly kind: 'accepted'; readonly receipt: AgentRunReceipt }
	| { readonly kind: 'refused'; readonly message: string };

export interface AgentRunEventConnection {
	close(): void;
}

export interface AgentRunTransport {
	/** A refusal the server decided (a 4xx) is a value; a request that may have landed throws. */
	submit(input: SubmitAgentRunInput): Promise<AgentRunSubmission>;
	get(runId: AgentRunId): Promise<AgentRunSnapshot>;
	/** Decides every parked call in one round trip; the run resumes once, not once per card. */
	decideMany(input: {
		runId: AgentRunId;
		callIds: readonly string[];
		decision: 'approve' | 'reject';
		message?: string;
	}): Promise<AgentRunSnapshot>;
	cancel(runId: AgentRunId): Promise<AgentRunSnapshot>;
	retry(runId: AgentRunId, requestId: string): Promise<AgentRunReceipt>;
	openEvents(input: {
		runId: AgentRunId;
		after: string;
		onOpen: () => void;
		onEvent: (record: StoredAgentRunEventRecord) => void | Promise<void>;
		onError: () => void;
	}): AgentRunEventConnection;
}

export interface StoredAgentRunClientState {
	readonly runId?: AgentRunId;
	readonly cursor: string;
	readonly attempt: number;
	readonly pendingRequestId?: string;
}

export type StoredAgentRunClientStateResult =
	| { readonly kind: 'missing' }
	| { readonly kind: 'valid'; readonly state: StoredAgentRunClientState }
	| { readonly kind: 'corrupt'; readonly message: string };

export interface AgentRunClientStorage {
	load(): StoredAgentRunClientStateResult;
	save(state: StoredAgentRunClientState): void;
	clear(): void;
}

const browser = typeof window !== 'undefined';
const activeStatuses: readonly AgentRunStatus[] = [
	'queued',
	'running',
	'awaiting_approval',
	'cancelling'
];

/**
 * The cause, and only the cause. It used to read "This change was never carried
 * out — the run ended before you answered", which said the same thing twice: the
 * block above it already states that nothing was applied, and to how many things.
 * What is left is the one fact this line is for.
 *
 * It also does not guess *why* the run ended. Stopping it is the common path and
 * a crash is not, but nothing here can tell them apart — and the journal's own
 * sentence, which can, is preferred over this whenever there is one.
 */
const ABANDONED_APPROVAL = 'The run ended before you answered.';

/**
 * A parked call is only still parked if its own run is still waiting. A conversation has at
 * most one active run, so anything else journalled `approval_required` belongs to a run that
 * died holding the question — and replaying it verbatim put a live Approve/Reject card back
 * on screen for a run that could never answer it. Approving it failed client-side only,
 * nothing was re-journalled, and the card returned on the next reload, for good.
 *
 * `failed` is already a status the thread renders — `toolDisclosure` leads with the failure —
 * so this needs no new state and no rewrite of the rows already stored that way.
 *
 * A row the reader cannot reconstruct is not one of these. It answers with the
 * `unreadable` part instead, because nothing is known about it except that it was
 * there: it has no name, no arguments, and no outcome to report.
 */
const restoredTool = (
	message: Message,
	awaitingRunId?: string
): ChatToolActivity | { readonly unreadable: string } => {
	const read = readJournalledTool(message.content, {
		...(message.runId ? { runId: message.runId } : {})
	});
	if (read.kind === 'unreadable')
		return {
			unreadable: `This tool call could not be read back from the transcript. ${read.reason}`
		};
	const { tool } = read;
	return tool.status === 'approval_required' && message.runId !== awaitingRunId
		? { ...tool, failure: ABANDONED_APPROVAL, status: 'failed' }
		: tool;
};

/** Messages without a cursor follow journalled parts and retain insertion order. */
const compareMessageCursors = (left: StoredMessage, right: StoredMessage): number => {
	if (left.eventCursor === undefined) return right.eventCursor === undefined ? 0 : 1;
	if (right.eventCursor === undefined) return -1;
	const a = BigInt(left.eventCursor);
	const b = BigInt(right.eventCursor);
	return a < b ? -1 : a > b ? 1 : 0;
};

const partsOfTurn = (messages: readonly StoredMessage[], awaitingRunId?: string): ChatPart[] => {
	const parts: ChatPart[] = [];
	// Sorted by cursor, because a turn's messages are not written in the order they happened:
	// tool activity is journalled as each call settles, while the agent's own output is
	// written when the run completes. Read back by insertion order, every turn looked like
	// all of the work followed by all of the words.
	for (const message of [...messages].sort(compareMessageCursors)) {
		// A row whose stored content the server could not read. It keeps its place
		// in the turn — `eventCursor` is an ordinary column and survives — so the
		// reader sees where the gap is rather than a turn quietly missing a step.
		if (message.kind === 'unreadable') {
			parts.push({ kind: 'unreadable', reason: message.reason });
			continue;
		}
		if (message.role === 'tool') {
			const restored = restoredTool(message, awaitingRunId);
			if ('unreadable' in restored) parts.push({ kind: 'unreadable', reason: restored.unreadable });
			else applyToolActivity(parts, restored);
			continue;
		}
		const text = typeof message.content.text === 'string' ? message.content.text : '';
		if (!text) continue;
		parts.push(
			message.content.type === 'reasoning' ? { kind: 'reasoning', text } : { kind: 'text', text }
		);
	}
	return parts;
};

/**
 * A stored conversation, back as turns.
 *
 * One entry per turn rather than one per stored message: an assistant turn is now written as
 * several messages — a thought, a tool call, an answer — and each becoming its own entry
 * would caption the same turn "Agent" three times over.
 *
 * `awaitingRunId` is the run, if any, that is genuinely parked on an approval; see
 * `restoredTool` for why every other parked call is restored as abandoned.
 */
const restoreEntries = (
	messages: readonly StoredMessage[],
	awaitingRunId?: string
): ChatEntry[] => {
	const entries: ChatEntry[] = [];
	let turn: { runId?: string; messages: StoredMessage[] } | undefined;

	const flush = (): void => {
		if (!turn?.messages.length) return;
		const first = turn.messages[0] as StoredMessage;
		entries.push({
			id: first.id,
			role: 'assistant',
			parts: partsOfTurn(turn.messages, awaitingRunId),
			suggestions: [],
			status: 'completed',
			...(turn.runId ? { runId: turn.runId as ChatEntry['runId'] } : {})
		});
		turn = undefined;
	};

	for (const message of messages) {
		if (message.role === 'user') {
			flush();
			// The user's own turn, whether or not its content read: an unreadable
			// prompt is still a turn the reader took, and dropping it would leave
			// the agent's reply answering nothing.
			const parts: ChatPart[] =
				message.kind === 'unreadable'
					? [{ kind: 'unreadable', reason: message.reason }]
					: [
							...(typeof message.content.text === 'string' && message.content.text
								? [{ kind: 'text' as const, text: message.content.text }]
								: []),
							...readRestoredImages(message.content.images)
						];
			entries.push({
				id: message.id,
				role: 'user',
				parts,
				suggestions: [],
				status: 'completed',
				...(message.runId ? { runId: message.runId } : {})
			});
			continue;
		}
		// A run boundary starts a new turn; messages without one join whatever is open, which
		// is how conversations written before runs were journalled still read as turns.
		if (turn && message.runId && turn.runId && message.runId !== turn.runId) flush();
		if (!turn) turn = { ...(message.runId ? { runId: message.runId } : {}), messages: [] };
		else if (!turn.runId && message.runId) turn.runId = message.runId;
		turn.messages.push(message);
	}
	flush();
	return entries;
};

/**
 * Fold a tool event into the row that already holds its call, or open a new row.
 *
 * The *part* is what changes, not the activity inside it. A settled call is a
 * different arm of `ChatToolActivity` from a running one, so the row becomes a
 * new value rather than being edited into place — and writing it back through
 * the part is what makes it stick, since `entryTools` builds a fresh array and
 * assigning into that would update nothing.
 */
const applyToolActivity = (parts: ChatPart[], incoming: ChatToolActivity): void => {
	const toolParts = parts.filter((part) => part.kind === 'tool');
	const index = matchToolActivity(
		toolParts.map((part) => part.tool),
		incoming
	);
	if (index === undefined) {
		parts.push({ kind: 'tool', tool: incoming });
		return;
	}
	const part = toolParts[index]!;
	part.tool = mergeToolActivity(part.tool, incoming);
};

/** What a row keeps across a change of state: which call it is, and what it was asked. */
const toolIdentity = (tool: ChatToolActivityBase) => ({
	callId: tool.callId,
	name: tool.name,
	arguments: tool.arguments,
	...(tool.runId ? { runId: tool.runId } : {})
});

const appendText = (entry: ChatEntry, text: string): void => {
	const last = entry.parts.at(-1);
	if (last?.kind === 'text') last.text += text;
	else entry.parts.push({ kind: 'text', text });
};

const appendReasoning = (entry: ChatEntry, text: string): void => {
	const last = entry.parts.at(-1);
	if (last?.kind === 'reasoning') last.text += text;
	else entry.parts.push({ kind: 'reasoning', text });
};

/** One chat: its transcript, its run stream and the composer's choices for the conversation. */
export class Chat implements ChatSession {
	entries = $state<ChatEntry[]>([]);
	/** True while a conversation's transcript is being fetched, so the thread can show a skeleton. */
	loading = $state(false);
	conversationId = $state<ConversationId | undefined>(undefined);
	modelOverride = $state<string | null>(null);
	visionModelOverride = $state<string | null>(null);
	executionModeOverride = $state<AgentExecutionMode>('approval_required');
	initialized = $state(false);
	/** True while a decision is in flight, so a bundle cannot be answered twice. */
	deciding = $state(false);
	chips = $state<ContextChip[]>([]);
	mentionDraft = $state<MentionHistory>(createMentionHistory(''));
	/** The automatic chip the user waved off, by `chipKeyOf`, so it stays off for that one resource. */
	autoChipDismissedFor = $state<string | undefined>(undefined);
	/**
	 * The one highlighted passage the user has waved off, by chip id. Not cleared on send:
	 * the text stays highlighted after a message goes out, and re-attaching a passage
	 * somebody explicitly detached would undo their decision behind their back.
	 */
	dismissedSelectionId = $state<string | undefined>(undefined);
	/**
	 * A prompt written by an invocation point elsewhere in the app, waiting for the
	 * composer to pick it up. `chat-handoff` covers the case where the panel has yet
	 * to mount; this covers the docked panel, which is mounted already and so never
	 * runs the `onMount` that consumes the handoff.
	 */
	staged = $state<ChatHandoff | undefined>(undefined);
	runId = $state<AgentRunId | undefined>(undefined);
	runStatus = $state<AgentRunStatus | undefined>(undefined);
	cursor = $state('0');
	attempt = $state(0);
	connection = $state<'detached' | 'connected' | 'reconnecting' | 'offline'>('detached');
	persistenceError = $state<string | undefined>(undefined);
	private hydratedConversationId?: ConversationId;
	private history: ChatHistorySource | null = null;
	private generation = 0;
	private connectionGeneration = 0;
	private liveConfirmed = $state(true);
	historyError = $state<string | null>(null);
	private refreshing: Promise<void> | null = null;
	private hydrating: { generation: number; promise: Promise<void> } | null = null;
	get canExecute(): boolean {
		return (
			(!browser || navigator.onLine) &&
			!this.loading &&
			(this.history === null || this.history.writable) &&
			this.liveConfirmed
		);
	}

	/**
	 * The user's own default, remembered from `initialize`. A conversation that
	 * chose no mode of its own falls back to it on hydration, which is the same
	 * chain the server resolves the run with.
	 */
	private defaultExecutionMode: AgentExecutionMode = 'approval_required';
	private eventConnection?: AgentRunEventConnection;
	private activeReply?: ChatEntry;
	private readonly storageKey: string;

	constructor(
		readonly sessionKey: ChatSessionKey,
		private readonly transport: AgentRunTransport,
		private readonly storage: AgentRunClientStorage,
		private readonly chipRules: ContextChips
	) {
		this.storageKey = `${STORAGE_KEY_PREFIX}.${sessionKey}`;
	}

	get isStreaming(): boolean {
		return this.runStatus !== undefined && activeStatuses.includes(this.runStatus);
	}

	initialize(defaultMode: AgentExecutionMode): void {
		this.defaultExecutionMode = defaultMode;
		if (this.initialized) return;
		const persisted = persistedConversation(this.storageKey);
		if (persisted.kind === 'corrupt')
			this.persistenceError = `Saved chat settings were corrupt. Reset them to continue safely. ${persisted.message}`;
		const choices = persisted.kind === 'valid' ? persisted.choices : {};
		this.conversationId = choices.conversationId;
		this.modelOverride = choices.modelOverride ?? null;
		this.visionModelOverride = choices.visionModelOverride ?? null;
		this.executionModeOverride = choices.executionModeOverride ?? defaultMode;
		this.initialized = true;
	}

	/**
	 * Write a prompt into the composer without sending it. The sentence is the point:
	 * the user reads what the agent is about to be asked, edits it if they want, and
	 * presses Enter. Nothing runs until they do.
	 */
	stage(request: ChatHandoff): void {
		this.staged = request;
	}

	hydrate(history: ChatHistorySource): Promise<void> {
		if (this.hydrating?.generation === this.generation) return this.hydrating.promise;
		const operation = { generation: this.generation, promise: this.hydrateHistory(history) };
		this.hydrating = operation;
		return operation.promise.finally(() => {
			if (this.hydrating === operation) this.hydrating = null;
		});
	}

	private async hydrateHistory(history: ChatHistorySource): Promise<void> {
		this.history = history;
		if (!browser || !this.conversationId) return;
		if (this.isStreaming && this.eventConnection) return;
		const conversationId = this.conversationId;
		const generation = this.generation;
		this.liveConfirmed = false;
		this.historyError = null;
		this.loading = true;
		try {
			if (this.hydratedConversationId === conversationId && this.eventConnection) {
				const current = await history.read(conversationId);
				if (generation !== this.generation || current.kind === 'stopped') return;
				if (current.kind === 'failure') throw new Error(current.message);
				this.loading = false;
				await this.revalidate();
				return;
			}
			const read = await history.read(conversationId);
			if (generation !== this.generation || read.kind === 'stopped') return;
			if (read.kind === 'failure') throw new Error(read.message);
			const run = read.latestRun;
			const data = {
				conversation: read.conversation,
				messages: read.messages,
				latestRun: run ? { run, pendingDecisions: run.pendingDecisions } : null
			};
			// The conversation's own settings, not the ones the last chat left behind.
			// These were read from `sessionStorage` and never reconciled with the row
			// the server actually resolves the run against, so the composer could read
			// "Approval" over a conversation set to auto-accept, and name a model no
			// run on it would use.
			this.modelOverride = data.conversation.modelOverride ?? null;
			this.visionModelOverride = data.conversation.visionModelOverride ?? null;
			this.executionModeOverride =
				data.conversation.executionModeOverride ?? this.defaultExecutionMode;
			// The latest run is the only one that can still be waiting on the user: a
			// conversation runs one at a time, so nothing older holds a live question.
			const awaiting =
				data.latestRun?.run.status === 'awaiting_approval' ? data.latestRun.run.id : undefined;
			this.entries = restoreEntries(data.messages, awaiting);
			if (data.latestRun) {
				const snapshot = data.latestRun;
				this.runId = snapshot.run.id;
				this.runStatus = snapshot.run.status;
				let reply = this.entries.findLast(
					(entry) => entry.role === 'assistant' && entry.runId === snapshot.run.id
				);
				if (!reply && snapshot.run.status !== 'completed') {
					this.entries.push({
						id: crypto.randomUUID(),
						role: 'assistant',
						parts: [],
						suggestions: [],
						status: 'waiting',
						runId: snapshot.run.id
					});
					// Re-read through the $state proxy: mutating the raw pushed object bypasses reactivity.
					reply = this.entries[this.entries.length - 1];
				}
				if (reply) {
					this.activeReply = reply;
					this.reconcileSnapshot(reply, snapshot);
				}
			}
			this.hydratedConversationId = conversationId;
			this.loading = false;
			await this.revalidate();
			// audit-allow: silent-catch — hydration failure moves the store to an explicit reconnecting/offline state rather than an empty chat.
		} catch (error) {
			if (generation !== this.generation) return;
			this.historyError =
				error instanceof Error ? error.message : 'Chat history could not be opened';
			this.connection = navigator.onLine ? 'reconnecting' : 'offline';
		} finally {
			if (generation === this.generation) this.loading = false;
		}
	}

	/** Cached history is readable offline; execution resumes only after a live server check. */
	revalidate(): Promise<void> {
		if (!navigator.onLine || (this.history !== null && !this.history.writable)) {
			this.detach();
			this.connection = 'offline';
			this.liveConfirmed = false;
			return Promise.resolve();
		}
		if (!this.runId) {
			this.liveConfirmed = true;
			return Promise.resolve();
		}
		if (this.refreshing) return this.refreshing;
		const operation = this.validateRun().then(() => undefined);
		this.refreshing = operation;
		return operation.finally(() => {
			if (this.refreshing === operation) this.refreshing = null;
		});
	}
	private async validateRun(): Promise<void | { kind: 'failure' }> {
		const runId = this.runId;
		const generation = this.generation;
		if (!runId) return;
		try {
			const snapshot = await this.transport.get(runId);
			if (
				generation !== this.generation ||
				this.runId !== runId ||
				(this.history !== null && !this.history.writable)
			)
				return;
			this.liveConfirmed = true;
			this.historyError = null;
			const reply = this.activeReply;
			if (reply) this.reconcileSnapshot(reply, snapshot);
			if (reply && activeStatuses.includes(snapshot.run.status) && !this.eventConnection) {
				const stored = this.storage.load();
				if (stored.kind === 'corrupt') this.persistenceError = stored.message;
				const saved =
					stored.kind === 'valid' && stored.state.runId === runId
						? stored.state
						: { cursor: '0', attempt: 0 };
				this.attach(reply, runId, saved.cursor, saved.attempt);
			}
		} catch (error) {
			if (generation !== this.generation) return;
			this.liveConfirmed = false;
			this.connection = navigator.onLine ? 'reconnecting' : 'offline';
			this.historyError =
				error instanceof Error ? error.message : 'The live run could not be checked';
			return { kind: 'failure' };
		}
	}

	resetCorruptPersistence(): void {
		if (browser) sessionStorage.removeItem(this.storageKey);
		this.storage.clear();
		this.persistenceError = undefined;
	}

	persistConversationChoices(): void {
		if (!browser || !this.initialized) return;
		sessionStorage.setItem(
			this.storageKey,
			JSON.stringify({
				conversationId: this.conversationId,
				modelOverride: this.modelOverride,
				visionModelOverride: this.visionModelOverride,
				executionModeOverride: this.executionModeOverride
			})
		);
	}

	addChip(chip: ContextChip): void {
		if (!this.chips.some((known) => known.kind === chip.kind && known.id === chip.id))
			this.chips = [...this.chips, chip];
	}

	removeChip(chip: ContextChip): void {
		this.chips = this.chips.filter((known) => known.kind !== chip.kind || known.id !== chip.id);
	}

	/** Drop a suggestion card once it has been accepted or rejected. */
	resolveSuggestion(suggestionId: string): void {
		for (const entry of this.entries)
			entry.suggestions = entry.suggestions.filter((view) => view.suggestion.id !== suggestionId);
	}

	async send(
		input: Omit<RunAgentInput, 'conversationId'> & { readonly retryUserOrdinal?: number }
	): Promise<void> {
		if (!this.canExecute || this.isStreaming) return;
		const generation = this.generation;
		const requestId = crypto.randomUUID();
		const noteChips = this.chips.flatMap((chip) => (chip.kind === 'note' ? [chip.id] : []));
		const skillChips = this.chips.flatMap((chip) => (chip.kind === 'skill' ? [chip.id] : []));
		const contextResources = this.chipRules.uniqueContextResources([
			...(input.contextResources ?? []),
			...this.chips.flatMap((chip) => this.chipRules.contextResourceRefOf(chip))
		]);
		// The singular `selection` is derived here and nowhere else. It stays on the wire
		// because the selection-bound tools (extract_promises, relate_selection, …) are offered
		// only when the run input has one; the plural field is what the prompt actually quotes.
		//
		// Pinned passages come first, so a pin takes that singular slot ahead of the passage
		// merely highlighted at the moment of sending: pinning is deliberate, highlighting is
		// incidental, and the tools should act on the one the user meant.
		const selections = [
			...this.chips
				.filter((chip): chip is SelectionChip => chip.kind === 'selection')
				.map((chip) => chip.selection),
			...(input.selections ?? [])
		];
		this.storage.save({ cursor: '0', attempt: 0, pendingRequestId: requestId });
		this.entries.push({
			id: crypto.randomUUID(),
			role: 'user',
			parts: [
				...(input.prompt ? [{ kind: 'text' as const, text: input.prompt }] : []),
				...(input.images ?? []).map((image) => ({
					kind: 'image' as const,
					id: image.id,
					dataUrl: image.dataUrl,
					name: image.name
				}))
			],
			suggestions: [],
			status: 'completed'
		});
		this.entries.push({
			id: crypto.randomUUID(),
			role: 'assistant',
			parts: [],
			suggestions: [],
			status: 'queued'
		});
		// Re-read through the $state proxy: mutating the raw pushed object bypasses reactivity.
		const reply = this.entries[this.entries.length - 1]!;
		this.activeReply = reply;
		this.runStatus = 'queued';
		try {
			const contextSnapshot = appContext.capture();
			const submitted = await this.transport.submit({
				requestId,
				input: input.prompt,
				...(input.images?.length ? { images: input.images } : {}),
				// Deliberately not echoed into `entries` above: the transcript shows
				// what the user sent, and this is context the app supplied.
				...(input.contextImages?.length ? { contextImages: input.contextImages } : {}),
				...(this.conversationId ? { conversationId: this.conversationId } : {}),
				model: this.modelOverride,
				visionModel: this.visionModelOverride,
				mode: this.executionModeOverride,
				appContext: contextSnapshot,
				...(input.projectId ? { projectId: input.projectId } : {}),
				...(input.noteId ? { noteId: input.noteId } : {}),
				...(selections.length ? { selections, selection: selections[0] } : {}),
				contextNoteIds: [...new SvelteSet([...(input.contextNoteIds ?? []), ...noteChips])],
				...(contextResources.length ? { contextResources } : {}),
				...(input.requestedSkillNames ? { requestedSkillNames: input.requestedSkillNames } : {}),
				requestedSkillNoteIds: [
					...new SvelteSet([...(input.requestedSkillNoteIds ?? []), ...skillChips])
				],
				...(input.retryUserOrdinal !== undefined
					? { retryUserOrdinal: input.retryUserOrdinal }
					: {})
			});
			if (generation !== this.generation) return;
			if (submitted.kind === 'refused') {
				// A decided answer: retrying reproduces it, so report what the server said.
				reply.error = submitted.message;
				this.runStatus = undefined;
				return;
			}
			const receipt = submitted.receipt;
			this.conversationId = receipt.conversationId;
			reply.runId = receipt.runId;
			this.runStatus = receipt.status;
			this.persistConversationChoices();
			this.attach(reply, receipt.runId, receipt.latestCursor, 0);
			// audit-allow: silent-catch — submission failure is attached to the pending reply and connection state exposes uncertainty.
		} catch {
			reply.error = 'Submission could not be confirmed. Reconnect to check its status.';
			this.connection = navigator.onLine ? 'reconnecting' : 'offline';
			this.runStatus = undefined;
		}
	}

	async stop(): Promise<void> {
		if (!this.canExecute || !this.runId) return;
		const runId = this.runId;
		const generation = this.generation;
		const reply = this.activeReply;
		if (reply) reply.status = 'cancelling';
		this.runStatus = 'cancelling';
		try {
			const snapshot = await this.transport.cancel(runId);
			if (generation !== this.generation) return;
			if (reply) this.reconcileSnapshot(reply, snapshot);
			// audit-allow: silent-catch — an unconfirmed cancel triggers an explicit server reconciliation attempt.
		} catch {
			// The cancel may still have landed server-side, so ask before giving up:
			// `cancelling` gates the composer and must never be a resting state here.
			try {
				const snapshot = await this.transport.get(runId);
				if (generation !== this.generation) return;
				if (reply) this.reconcileSnapshot(reply, snapshot);
				// audit-allow: silent-catch — failed reconciliation marks cancellation unconfirmed instead of claiming success.
			} catch {
				if (generation !== this.generation) return;
				if (reply) reply.error = 'Cancellation has not been confirmed yet.';
				this.runStatus = undefined;
			}
		}
	}

	/**
	 * The user turn a reply answers, so an answer can be asked again with the
	 * question that produced it.
	 */
	precedingUserEntry(reply: ChatEntry): ChatEntry | undefined {
		const index = this.entries.indexOf(reply);
		if (index < 0) return undefined;
		return this.entries.slice(0, index).findLast((entry) => entry.role === 'user');
	}

	/**
	 * One-based position of a user turn among the user turns. This, rather than an
	 * id, is how the server addresses the turn to rewind to: an optimistically sent
	 * entry carries a client uuid, not the message id the server assigned it.
	 */
	private userOrdinalOf(entry: ChatEntry): number | undefined {
		let ordinal = 0;
		for (const candidate of this.entries) {
			if (candidate.role !== 'user') continue;
			ordinal += 1;
			if (candidate === entry) return ordinal;
		}
		return undefined;
	}

	/**
	 * Replace a question and everything it led to. The turn and its successors leave
	 * the transcript here; the run carries the ordinal so the server discards the
	 * same span from its own record before the agent replays the conversation.
	 * Returns false when the resubmission could not be started at all.
	 */
	async resubmit(entry: ChatEntry, input: Omit<RunAgentInput, 'conversationId'>): Promise<boolean> {
		if (!this.canExecute || this.isStreaming || entry.role !== 'user' || !input.prompt.trim())
			return false;
		const ordinal = this.userOrdinalOf(entry);
		const index = this.entries.indexOf(entry);
		if (ordinal === undefined || index < 0) return false;
		this.entries = this.entries.slice(0, index);
		await this.send({ ...input, retryUserOrdinal: ordinal });
		return true;
	}

	async retry(reply: ChatEntry): Promise<void> {
		if (!this.canExecute || this.isStreaming || !reply.runId) return;
		const generation = this.generation;
		const receipt = await this.transport.retry(reply.runId, crypto.randomUUID());
		if (generation !== this.generation) return;
		reply.status = 'queued';
		reply.error = undefined;
		reply.retryable = false;
		this.activeReply = reply;
		this.runStatus = receipt.status;
		this.attach(reply, receipt.runId, receipt.latestCursor, 0);
	}

	decide(reply: ChatEntry, tool: ChatToolActivity, decision: 'approve' | 'reject'): Promise<void> {
		return this.decideAll(reply, [tool], decision);
	}

	/**
	 * Answers every parked call in one request. Deciding them one at a time would requeue and
	 * resume the run between each, so the second decision would arrive at a run that is no
	 * longer awaiting approval and be rejected.
	 */
	async decideAll(
		reply: ChatEntry,
		tools: readonly ChatToolActivity[],
		decision: 'approve' | 'reject'
	): Promise<void> {
		if (!this.canExecute || this.deciding) return;
		// Only a parked call can be decided, and only a parked call carries a
		// catalog name the decision can be replayed under.
		const parked = tools.filter(
			(tool): tool is Extract<ChatToolActivity, { status: 'approval_required' }> =>
				tool.status === 'approval_required'
		);
		const runId = parked.find((tool) => tool.runId)?.runId;
		// A call the run could not name is a call the server cannot match a decision
		// to, so it is not sent. Parked approvals always carry one.
		const callIds = parked
			.map((tool) => tool.callId)
			.filter((callId): callId is string => callId !== undefined);
		if (!runId || callIds.length === 0) return;
		this.deciding = true;
		const generation = this.generation;
		try {
			const snapshot = await this.transport.decideMany({
				runId: runId as AgentRunId,
				callIds,
				decision
			});
			if (generation !== this.generation) return;
			// Replaced, not edited: an approved call is `running` and a refused one is
			// `rejected`, and neither is the arm the parked row was in.
			for (const tool of parked)
				applyToolActivity(
					reply.parts,
					decision === 'approve'
						? { ...toolIdentity(tool), status: 'running' }
						: { ...toolIdentity(tool), status: 'rejected' }
				);
			this.reconcileSnapshot(reply, snapshot);
			this.attach(reply, snapshot.run.id, this.cursor, this.attempt);
			// audit-allow: silent-catch — every affected tool is marked failed so the decision is never presented as applied.
		} catch {
			if (generation !== this.generation) return;
			for (const tool of parked)
				applyToolActivity(reply.parts, {
					...toolIdentity(tool),
					failure: 'The decision could not be applied.',
					status: 'failed'
				});
		} finally {
			if (generation === this.generation) this.deciding = false;
		}
	}

	detach(): void {
		this.connectionGeneration++;
		this.eventConnection?.close();
		this.eventConnection = undefined;
		this.connection = 'detached';
	}

	clear(): void {
		this.generation++;
		this.refreshing = null;
		this.deciding = false;
		this.historyError = null;
		this.liveConfirmed = true;
		this.detach();
		this.entries = [];
		this.loading = false;
		this.conversationId = undefined;
		this.modelOverride = null;
		this.visionModelOverride = null;
		this.chips = [];
		this.mentionDraft = createMentionHistory('');
		this.autoChipDismissedFor = undefined;
		this.dismissedSelectionId = undefined;
		this.hydratedConversationId = undefined;
		this.runId = undefined;
		this.runStatus = undefined;
		this.cursor = '0';
		this.attempt = 0;
		this.activeReply = undefined;
		this.storage.clear();
		if (browser) sessionStorage.removeItem(this.storageKey);
	}

	async switchToConversation(id: ConversationId, history: ChatHistorySource): Promise<void> {
		if (this.conversationId === id) return this.hydrate(history);
		this.generation++;
		this.refreshing = null;
		this.deciding = false;
		this.historyError = null;
		this.detach();
		this.entries = [];
		this.conversationId = id;
		this.hydratedConversationId = undefined;
		// Dropped before the fetch rather than replaced after it: a hydration that
		// fails must leave the composer showing nothing borrowed from the chat being
		// left, not that chat's model and mode over this one's transcript.
		this.modelOverride = null;
		this.visionModelOverride = null;
		this.executionModeOverride = this.defaultExecutionMode;
		this.chips = [];
		this.mentionDraft = createMentionHistory('');
		this.autoChipDismissedFor = undefined;
		this.dismissedSelectionId = undefined;
		this.runId = undefined;
		this.runStatus = undefined;
		this.activeReply = undefined;
		this.persistConversationChoices();
		await this.hydrate(history);
	}

	private attach(reply: ChatEntry, runId: AgentRunId, cursor: string, attempt: number): void {
		this.detach();
		this.activeReply = reply;
		this.runId = runId;
		this.cursor = cursor;
		this.attempt = attempt;
		this.connection = 'reconnecting';
		this.storage.save({ runId, cursor, attempt });
		const generation = this.connectionGeneration;
		let appliedCursor = cursor;
		this.eventConnection = this.transport.openEvents({
			runId,
			after: cursor,
			onOpen: () => {
				if (generation === this.connectionGeneration) this.connection = 'connected';
			},
			onEvent: async (record) => {
				if (generation !== this.connectionGeneration) return;
				const event = record.kind === 'readable' ? record.event : undefined;
				const terminal =
					event?.type === 'completed' ||
					event?.type === 'cancelled' ||
					(event?.type === 'failed' && !event.retryable);
				if (event?.type === 'resources_stale' || terminal) await this.history?.refresh();
				if (generation !== this.connectionGeneration) return;
				if (BigInt(record.cursor) > BigInt(appliedCursor)) {
					if (event) this.apply(reply, event);
					else
						reply.parts.push({
							kind: 'unreadable',
							reason: 'Some saved agent activity could not be restored.'
						});
					appliedCursor = record.cursor;
				}
				this.storage.save({ runId, cursor: record.cursor, attempt: record.attempt });
				this.cursor = record.cursor;
				if (terminal) this.detach();
			},
			onError: () => {
				if (generation === this.connectionGeneration)
					void this.reconcileAfterDisconnect(reply, runId);
			}
		});
	}

	private async reconcileAfterDisconnect(reply: ChatEntry, runId: AgentRunId): Promise<void> {
		const generation = this.connectionGeneration;
		this.connection = navigator.onLine ? 'reconnecting' : 'offline';
		try {
			const snapshot = await this.transport.get(runId);
			if (generation !== this.connectionGeneration) return;
			this.reconcileSnapshot(reply, snapshot);
			if (
				!activeStatuses.includes(snapshot.run.status) &&
				BigInt(this.cursor) >= BigInt(snapshot.latestCursor)
			) {
				await this.history?.refresh();
				if (generation === this.connectionGeneration) this.detach();
			}
			// audit-allow: silent-catch — refresh failure moves the connection into its visible reconnecting/offline state.
		} catch {
			this.connection = navigator.onLine ? 'reconnecting' : 'offline';
		}
	}

	private reconcileSnapshot(
		reply: ChatEntry,
		snapshot: {
			run: Pick<WorkspaceValues['agent_runs'], 'id' | 'status' | 'failure'>;
			pendingDecisions: AgentRunSnapshot['pendingDecisions'];
		}
	): void {
		this.runId = snapshot.run.id;
		this.runStatus = snapshot.run.status;
		reply.runId = snapshot.run.id;
		for (const tool of entryTools(reply)) {
			if (
				tool.status === 'approval_required' &&
				!snapshot.pendingDecisions.some((pending) => pending.callId === tool.callId)
			)
				applyToolActivity(reply.parts, {
					...toolIdentity(tool),
					status: 'failed',
					failure: ABANDONED_APPROVAL
				});
		}
		if (snapshot.run.status === 'queued') reply.status = 'queued';
		else if (snapshot.run.status === 'running') reply.status = 'streaming';
		else if (snapshot.run.status === 'awaiting_approval') {
			reply.status = 'awaiting_approval';
			for (const pending of snapshot.pendingDecisions)
				applyToolActivity(reply.parts, {
					callId: pending.callId,
					name: pending.toolName,
					arguments: toolArguments(pending.arguments),
					...(pending.review ? { noteReview: readNoteReview(pending.review) } : {}),
					runId: snapshot.run.id,
					status: 'approval_required'
				});
		} else if (snapshot.run.status === 'cancelling') reply.status = 'cancelling';
		else if (snapshot.run.status === 'completed') reply.status = 'completed';
		else if (snapshot.run.status === 'cancelled') {
			reply.status = 'cancelled';
			reply.error = 'Generation stopped';
		} else {
			reply.status = 'failed';
			reply.error = snapshot.run.failure ?? 'The agent run failed.';
			reply.retryable = true;
		}
	}

	private apply(reply: ChatEntry, event: AgentEvent): void {
		if (event.type === 'run_queued') {
			this.runStatus = 'queued';
			reply.status = 'queued';
			if (event.reason === 'retry') reply.error = 'Retrying after a temporary provider failure.';
		} else if (event.type === 'run_started') {
			if (reply.runId !== event.runId || event.attempt > (reply.attempt ?? 0)) {
				reply.parts = [];
				reply.suggestions = [];
				reply.error = undefined;
			}
			reply.runId = event.runId;
			reply.attempt = event.attempt;
			this.attempt = event.attempt;
			this.runStatus = 'running';
			reply.status = 'waiting';
		} else if (event.type === 'text_delta') {
			reply.status = 'streaming';
			appendText(reply, event.text);
		} else if (event.type === 'reasoning_delta') {
			reply.status = 'streaming';
			appendReasoning(reply, event.text);
		} else if (event.type === 'tool_started') {
			reply.status = 'streaming';
			applyToolActivity(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: toolArguments(event.arguments),
				status: 'running'
			});
		} else if (event.type === 'tool_succeeded') {
			applyToolActivity(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: {},
				...(event.output === undefined ? {} : { output: event.output }),
				status: 'succeeded'
			});
		} else if (event.type === 'tool_reported_failure') {
			applyToolActivity(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: {},
				failure: event.failure,
				output: event.output,
				status: 'reported_failure'
			});
		} else if (event.type === 'tool_failed') {
			applyToolActivity(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: {},
				failure: event.failure,
				status: 'failed'
			});
		} else if (event.type === 'approval_required') {
			this.runStatus = 'awaiting_approval';
			reply.status = 'awaiting_approval';
			applyToolActivity(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: toolArguments(event.arguments),
				...(event.review ? { noteReview: readNoteReview(event.review) } : {}),
				runId: event.runId,
				status: 'approval_required'
			});
		} else if (event.type === 'failed') {
			reply.status = event.retryable ? 'queued' : 'failed';
			reply.runId = event.runId ?? reply.runId;
			reply.error = event.message;
			reply.retryable = event.retryable;
			if (!event.retryable) this.runStatus = 'failed';
		} else if (event.type === 'cancelled') {
			reply.status = 'cancelled';
			this.runStatus = 'cancelled';
			reply.error = event.message;
		} else if (event.type === 'completed') {
			reply.status = 'completed';
			this.runStatus = 'completed';
			this.conversationId = event.conversationId;
		}
	}
}
