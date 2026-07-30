import type {
	AgentEvent,
	AgentExecutionMode,
	AgentRunId,
	AgentRunSnapshot,
	AgentRunStatus,
	ConversationId,
	NoteId,
	RunAgentInput,
	SuggestionView
} from '$lib/models';
import type {
	AgentRunClientStorage,
	AgentRunEventConnection,
	AgentRunTransport
} from '$lib/client/agent-runs/contracts';
import { RemoteAgentRunTransport } from '$lib/client/agent-runs/remote-transport';
import { SessionAgentRunStorage } from '$lib/client/agent-runs/session-storage';
import { refreshStale } from '$lib/client/resource-queries';
import { reconcileToolActivity, type ChatToolActivity, type ChatToolStatus } from './chat-tools';
import { suggestionToView } from './suggestion-view';
import { appContext } from './app-context.svelte';
import type { ChatHandoff } from './chat-handoff';
import { SvelteSet } from 'svelte/reactivity';

export type { ChatToolActivity } from './chat-tools';

const STORAGE_KEY = 'followthrough.agent.conversation';
const browser = typeof window !== 'undefined';
const activeStatuses: readonly AgentRunStatus[] = [
	'queued',
	'running',
	'awaiting_approval',
	'cancelling'
];

/**
 * A rejected submission is only worth a reconnect prompt when it might still
 * have landed. A 4xx is a decided answer: retrying reproduces it, so report
 * what the server said instead of blaming the connection.
 */
function rejectionMessage(error: unknown): string | undefined {
	if (typeof error !== 'object' || error === null) return undefined;
	const { status, body, message } = error as {
		status?: unknown;
		body?: { message?: unknown };
		message?: unknown;
	};
	if (typeof status !== 'number' || status < 400 || status >= 500) return undefined;
	const text = typeof body?.message === 'string' ? body.message : message;
	return typeof text === 'string' && text.length > 0 ? text : 'That request was rejected.';
}

interface PersistedConversationChoices {
	conversationId?: ConversationId;
	modelOverride?: string | null;
	executionModeOverride?: AgentExecutionMode;
}

const persistedConversation = (): PersistedConversationChoices => {
	if (!browser) return {};
	try {
		return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as PersistedConversationChoices;
	} catch {
		return {};
	}
};

export interface ContextChip {
	readonly kind: 'note' | 'skill';
	readonly id: NoteId;
	readonly name: string;
}

export type ChatPart =
	| { kind: 'text'; text: string }
	| { kind: 'reasoning'; text: string }
	| { kind: 'tool'; tool: ChatToolActivity };

export interface ChatEntry {
	readonly id: string;
	readonly role: 'user' | 'assistant';
	parts: ChatPart[];
	suggestions: SuggestionView[];
	status?:
		| 'queued'
		| 'waiting'
		| 'streaming'
		| 'awaiting_approval'
		| 'cancelling'
		| 'completed'
		| 'failed'
		| 'cancelled';
	runId?: AgentRunId;
	attempt?: number;
	error?: string;
	retryable?: boolean;
}

/** The prose of a turn, with tool activity left out. */
export const entryText = (entry: ChatEntry): string =>
	entry.parts
		.filter((part) => part.kind === 'text')
		.map((part) => part.text)
		.join('\n');

const entryTools = (entry: ChatEntry): ChatToolActivity[] =>
	entry.parts.filter((part) => part.kind === 'tool').map((part) => part.tool);

const applyToolActivity = (entry: ChatEntry, incoming: ChatToolActivity): void => {
	if (!reconcileToolActivity(entryTools(entry), incoming))
		entry.parts.push({ kind: 'tool', tool: incoming });
};

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

export class ChatStore {
	entries = $state<ChatEntry[]>([]);
	conversationId = $state<ConversationId | undefined>(undefined);
	modelOverride = $state<string | null>(null);
	executionModeOverride = $state<AgentExecutionMode>('approval_required');
	initialized = $state(false);
	chips = $state<ContextChip[]>([]);
	autoChipDismissedFor = $state<NoteId | undefined>(undefined);
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
	private hydratedConversationId?: ConversationId;
	private eventConnection?: AgentRunEventConnection;
	private activeReply?: ChatEntry;
	private observers = 0;

	constructor(
		private readonly transport: AgentRunTransport = new RemoteAgentRunTransport(),
		private readonly storage: AgentRunClientStorage = new SessionAgentRunStorage()
	) {}

	get isStreaming(): boolean {
		return this.runStatus !== undefined && activeStatuses.includes(this.runStatus);
	}

	initialize(defaultMode: AgentExecutionMode): void {
		if (this.initialized) return;
		const persisted = persistedConversation();
		this.conversationId = persisted.conversationId;
		this.modelOverride = persisted.modelOverride ?? null;
		this.executionModeOverride = persisted.executionModeOverride ?? defaultMode;
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

	observe(): () => void {
		this.observers += 1;
		return () => {
			this.observers = Math.max(0, this.observers - 1);
			if (this.observers === 0) this.detach();
		};
	}

	async hydrate(): Promise<void> {
		if (!browser || !this.conversationId || this.hydratedConversationId === this.conversationId)
			return;
		const conversationId = this.conversationId;
		try {
			const data = await this.transport.getSession(conversationId);
			const entries: ChatEntry[] = [];
			let pendingTools: ChatToolActivity[] = [];
			for (const message of data.messages) {
				if (message.role === 'tool') {
					const content = message.content;
					const incoming: ChatToolActivity = {
						callId: String(content.callId ?? ''),
						name: String(content.name ?? 'tool'),
						arguments: (content.input ?? {}) as Readonly<Record<string, unknown>>,
						...(message.runId ? { runId: message.runId } : {}),
						...(content.output !== null ? { output: content.output } : {}),
						...(typeof content.failure === 'string' ? { failure: content.failure } : {}),
						status: String(content.status ?? 'succeeded') as ChatToolStatus
					};
					if (!reconcileToolActivity(pendingTools, incoming)) pendingTools.push(incoming);
					continue;
				}
				const text = typeof message.content.text === 'string' ? message.content.text : '';
				entries.push({
					id: message.id,
					role: message.role,
					parts: [
						...(message.role === 'assistant'
							? pendingTools.map((tool): ChatPart => ({ kind: 'tool', tool }))
							: []),
						...(text ? [{ kind: 'text' as const, text }] : [])
					],
					suggestions: [],
					status: 'completed',
					...(message.runId ? { runId: message.runId } : {})
				});
				if (message.role === 'assistant') pendingTools = [];
			}
			this.entries = entries;
			if (data.latestRun) {
				const snapshot = data.latestRun;
				let reply = this.entries.findLast(
					(entry) => entry.role === 'assistant' && entry.runId === snapshot.run.id
				);
				if (!reply && snapshot.run.status !== 'completed') {
					this.entries.push({
						id: crypto.randomUUID(),
						role: 'assistant',
						parts: pendingTools.map((tool) => ({ kind: 'tool', tool })),
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
				if (activeStatuses.includes(snapshot.run.status) && reply) {
					const stored = this.storage.load();
					const resumeCursor = stored.runId === snapshot.run.id ? stored.cursor : '0';
					const resumeAttempt = stored.runId === snapshot.run.id ? stored.attempt : 0;
					this.attach(reply, snapshot.run.id, resumeCursor, resumeAttempt);
				}
			}
			this.hydratedConversationId = conversationId;
		} catch {
			this.connection = navigator.onLine ? 'reconnecting' : 'offline';
		}
	}

	persistConversationChoices(): void {
		if (!browser || !this.initialized) return;
		sessionStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				conversationId: this.conversationId,
				modelOverride: this.modelOverride,
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

	/**
	 * Drop a suggestion card once it has been accepted or rejected. The note tray
	 * does this through its own registry; a decision made from the panel with no
	 * note open has to say so here, or the card outlives the thing it proposed.
	 */
	resolveSuggestion(suggestionId: string): void {
		for (const entry of this.entries)
			entry.suggestions = entry.suggestions.filter((view) => view.suggestion.id !== suggestionId);
	}

	async send(
		input: Omit<RunAgentInput, 'conversationId'> & { readonly retryUserOrdinal?: number }
	): Promise<void> {
		if (this.isStreaming) return;
		const requestId = crypto.randomUUID();
		const noteChips = this.chips.filter((chip) => chip.kind === 'note').map((chip) => chip.id);
		const skillChips = this.chips.filter((chip) => chip.kind === 'skill').map((chip) => chip.name);
		this.storage.save({ cursor: '0', attempt: 0, pendingRequestId: requestId });
		this.entries.push({
			id: crypto.randomUUID(),
			role: 'user',
			parts: [{ kind: 'text', text: input.prompt }],
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
			const receipt = await this.transport.submit({
				requestId,
				input: input.prompt,
				...(this.conversationId ? { conversationId: this.conversationId } : {}),
				model: this.modelOverride,
				mode: this.executionModeOverride,
				appContext: contextSnapshot,
				...(input.projectId ? { projectId: input.projectId } : {}),
				...(input.noteId ? { noteId: input.noteId } : {}),
				...(input.selection ? { selection: input.selection } : {}),
				contextNoteIds: [...new SvelteSet([...(input.contextNoteIds ?? []), ...noteChips])],
				requestedSkillNames: [
					...new SvelteSet([...(input.requestedSkillNames ?? []), ...skillChips])
				],
				...(input.requestedSkillNoteIds
					? { requestedSkillNoteIds: input.requestedSkillNoteIds }
					: {}),
				...(input.retryUserOrdinal !== undefined
					? { retryUserOrdinal: input.retryUserOrdinal }
					: {})
			});
			this.conversationId = receipt.conversationId;
			reply.runId = receipt.runId;
			this.runStatus = receipt.status;
			this.persistConversationChoices();
			this.attach(reply, receipt.runId, receipt.latestCursor, 0);
		} catch (error) {
			const rejected = rejectionMessage(error);
			reply.error = rejected ?? 'Submission could not be confirmed. Reconnect to check its status.';
			if (!rejected) this.connection = navigator.onLine ? 'reconnecting' : 'offline';
			this.runStatus = undefined;
		}
	}

	async stop(): Promise<void> {
		if (!this.runId) return;
		const reply = this.activeReply;
		if (reply) reply.status = 'cancelling';
		this.runStatus = 'cancelling';
		try {
			const snapshot = await this.transport.cancel(this.runId);
			if (reply) this.reconcileSnapshot(reply, snapshot);
		} catch {
			if (reply) reply.error = 'Cancellation has not been confirmed yet.';
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
		if (this.isStreaming || entry.role !== 'user' || !input.prompt.trim()) return false;
		const ordinal = this.userOrdinalOf(entry);
		const index = this.entries.indexOf(entry);
		if (ordinal === undefined || index < 0) return false;
		this.entries = this.entries.slice(0, index);
		await this.send({ ...input, retryUserOrdinal: ordinal });
		return true;
	}

	async retry(reply: ChatEntry): Promise<void> {
		if (this.isStreaming || !reply.runId) return;
		const receipt = await this.transport.retry(reply.runId, crypto.randomUUID());
		reply.status = 'queued';
		reply.error = undefined;
		reply.retryable = false;
		this.activeReply = reply;
		this.runStatus = receipt.status;
		this.attach(reply, receipt.runId, receipt.latestCursor, 0);
	}

	async decide(
		reply: ChatEntry,
		tool: ChatToolActivity,
		decision: 'approve' | 'reject'
	): Promise<void> {
		if (!tool.runId) return;
		try {
			const snapshot = await this.transport.decide({
				runId: tool.runId as AgentRunId,
				callId: tool.callId,
				decision
			});
			tool.status = decision === 'approve' ? 'running' : 'rejected';
			this.reconcileSnapshot(reply, snapshot);
			this.attach(reply, snapshot.run.id, this.cursor, this.attempt);
		} catch {
			tool.status = 'failed';
			tool.failure = 'The decision could not be applied.';
		}
	}

	detach(): void {
		this.eventConnection?.close();
		this.eventConnection = undefined;
		this.connection = 'detached';
	}

	clear(): void {
		this.detach();
		this.entries = [];
		this.conversationId = undefined;
		this.modelOverride = null;
		this.chips = [];
		this.autoChipDismissedFor = undefined;
		this.hydratedConversationId = undefined;
		this.runId = undefined;
		this.runStatus = undefined;
		this.cursor = '0';
		this.attempt = 0;
		this.activeReply = undefined;
		this.storage.clear();
		if (browser) sessionStorage.removeItem(STORAGE_KEY);
	}

	async switchToConversation(id: ConversationId): Promise<void> {
		if (this.conversationId === id) return;
		this.detach();
		this.entries = [];
		this.conversationId = id;
		this.hydratedConversationId = undefined;
		this.chips = [];
		this.autoChipDismissedFor = undefined;
		this.runId = undefined;
		this.runStatus = undefined;
		this.activeReply = undefined;
		this.persistConversationChoices();
		await this.hydrate();
	}

	private attach(reply: ChatEntry, runId: AgentRunId, cursor: string, attempt: number): void {
		this.detach();
		this.activeReply = reply;
		this.runId = runId;
		this.cursor = cursor;
		this.attempt = attempt;
		this.connection = 'reconnecting';
		this.storage.save({ runId, cursor, attempt });
		this.eventConnection = this.transport.openEvents({
			runId,
			after: cursor,
			onOpen: () => (this.connection = 'connected'),
			onEvent: (record) => {
				if (BigInt(record.cursor) <= BigInt(this.cursor)) return;
				this.cursor = record.cursor;
				this.storage.save({ runId, cursor: this.cursor, attempt: this.attempt });
				this.apply(reply, record.event, record.attempt);
			},
			onError: () => void this.reconcileAfterDisconnect(reply, runId)
		});
	}

	private async reconcileAfterDisconnect(reply: ChatEntry, runId: AgentRunId): Promise<void> {
		this.connection = navigator.onLine ? 'reconnecting' : 'offline';
		try {
			const snapshot = await this.transport.get(runId);
			this.reconcileSnapshot(reply, snapshot);
			if (!activeStatuses.includes(snapshot.run.status)) this.detach();
		} catch {
			this.connection = navigator.onLine ? 'reconnecting' : 'offline';
		}
	}

	private reconcileSnapshot(reply: ChatEntry, snapshot: AgentRunSnapshot): void {
		this.runId = snapshot.run.id;
		this.runStatus = snapshot.run.status;
		reply.runId = snapshot.run.id;
		if (snapshot.run.status === 'queued') reply.status = 'queued';
		else if (snapshot.run.status === 'running') reply.status = 'streaming';
		else if (snapshot.run.status === 'awaiting_approval') {
			reply.status = 'awaiting_approval';
			for (const pending of snapshot.pendingDecisions)
				applyToolActivity(reply, {
					callId: pending.callId,
					name: pending.toolName,
					arguments: pending.arguments,
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

	private apply(reply: ChatEntry, event: AgentEvent, attempt: number): void {
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
			applyToolActivity(reply, {
				callId: event.callId,
				name: event.name,
				arguments: event.arguments,
				status: 'running'
			});
		} else if (event.type === 'tool_completed') {
			applyToolActivity(reply, {
				callId: event.callId,
				name: event.name,
				arguments: {},
				...(event.output === undefined ? {} : { output: event.output }),
				...(event.failure === undefined ? {} : { failure: event.failure }),
				status: event.failure ? 'failed' : 'succeeded'
			});
		} else if (event.type === 'approval_required') {
			this.runStatus = 'awaiting_approval';
			reply.status = 'awaiting_approval';
			applyToolActivity(reply, {
				callId: event.callId,
				name: event.name,
				arguments: event.arguments,
				runId: event.runId,
				status: 'approval_required'
			});
		} else if (event.type === 'suggestion')
			reply.suggestions.push(suggestionToView(event.suggestion, 'agent'));
		else if (event.type === 'failed') {
			reply.status = event.retryable ? 'queued' : 'failed';
			reply.runId = event.runId ?? reply.runId;
			reply.error = event.message;
			reply.retryable = event.retryable;
			if (!event.retryable) this.runStatus = 'failed';
		} else if (event.type === 'cancelled') {
			reply.status = 'cancelled';
			this.runStatus = 'cancelled';
			reply.error = event.message;
			this.detach();
		} else if (event.type === 'completed') {
			reply.status = 'completed';
			this.runStatus = 'completed';
			this.conversationId = event.conversationId;
			this.detach();
		} else if (event.type === 'resources_stale') refreshStale(event.resources);
		this.storage.save({
			...(this.runId ? { runId: this.runId } : {}),
			cursor: this.cursor,
			attempt
		});
	}
}

export const chat = new ChatStore();
