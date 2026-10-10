import type {
	AgentEvent,
	AgentExecutionMode,
	AgentRunId,
	AgentRunSnapshot,
	AgentRunStatus,
	ConversationId,
	RunAgentInput,
	StoredMessage,
	AgentReview
} from '$lib/models/agent';
import type { SuggestionId } from '$lib/models/suggestions';
import type {
	AgentRunClientStorage,
	AgentRunTransport
} from '$lib/controllers/agent/run-transport';
import type { WorkspaceResourcesController } from '$lib/controllers/workspace/resources';
import type { WorkspaceValues } from '$lib/models/workspace-records';
import { accessMessage } from '$lib/services/sync/state';
import {
	type ChatHandoff,
	type SelectionChip,
	type ContextChip,
	type MentionHistory,
	createMentionHistory,
	type ChatJournalMessage,
	type ChatEntry,
	type MutableChatEntry,
	type ChatToolActivity,
	type ChatSessionKey,
	type PersistedConversationChoices,
	type PersistedConversationResult
} from '$lib/models/chat';
import type { ChatChipRules } from '$lib/services/chat/chips';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { NoteChangeReview } from '$lib/models/notes';
import type { AppContextSnapshotV1 } from '$lib/models/workspace';
import type { ChatSessionState } from '$lib/stores/agent/chat-session.svelte';
import type { ChatTranscript } from '$lib/services/chat/transcript';

export interface ChatPayloadReader {
	messages(messages: readonly StoredMessage[]): ChatJournalMessage[];
	arguments(value: AgentPayload): AgentPayloadObject;
	review(value: AgentReview): NoteChangeReview;
}
export interface ChatChoicesStorage {
	load(): PersistedConversationResult;
	save(choices: PersistedConversationChoices): void;
	clear(): void;
}
export interface ChatEnvironment {
	readonly online: boolean;
	id(): string;
	rejectionMessage(error: object): string | undefined;
}
export interface ChatContextCapture {
	capture(): AppContextSnapshotV1;
}
export interface ChatSessionView {
	readonly sessionKey: ChatSessionKey;
	readonly canExecute: boolean;
	readonly isStreaming: boolean;
	readonly entries: readonly ChatEntry[];
	readonly loading: boolean;
	readonly conversationId: ConversationId | undefined;
	readonly modelOverride: string | null;
	readonly visionModelOverride: string | null;
	readonly executionModeOverride: AgentExecutionMode;
	readonly initialized: boolean;
	readonly deciding: boolean;
	readonly chips: readonly ContextChip[];
	readonly mentionDraft: MentionHistory;
	readonly autoChipDismissedFor: string | undefined;
	readonly dismissedSelectionId: string | undefined;
	readonly staged: ChatHandoff | undefined;
	readonly runId: AgentRunId | undefined;
	readonly runStatus: AgentRunStatus | undefined;
	readonly cursor: string;
	readonly attempt: number;
	readonly connection: 'detached' | 'connected' | 'reconnecting' | 'offline';
	readonly persistenceError: string | undefined;
	readonly historyError: string | null;
}
export interface ChatSessionController extends ChatSessionView {
	initialize(defaultMode: AgentExecutionMode): void;
	stage(request: ChatHandoff): void;
	consumeStaged(): ChatHandoff | undefined;
	hydrate(resources: WorkspaceResourcesController): Promise<void>;
	revalidate(): Promise<void>;
	resetCorruptPersistence(): void;
	persistConversationChoices(): void;
	addChip(chip: ContextChip): void;
	removeChip(chip: ContextChip): void;
	setChips(chips: readonly ContextChip[]): void;
	setMentionDraft(history: MentionHistory): void;
	dismissAutoChip(key: string): void;
	dismissSelection(id: string): void;
	chooseModel(model: string | null): void;
	chooseVisionModel(model: string | null): void;
	chooseExecutionMode(mode: AgentExecutionMode): void;
	decideSuggestion(
		id: SuggestionId,
		decision: 'accept' | 'reject',
		decide: (id: SuggestionId, decision: 'accept' | 'reject') => Promise<boolean>
	): Promise<boolean>;
	resolveSuggestion(id: string): void;
	send(
		input: Omit<RunAgentInput, 'conversationId'> & { readonly retryUserOrdinal?: number }
	): Promise<void>;
	stop(): Promise<void>;
	precedingUserEntry(reply: ChatEntry): ChatEntry | undefined;
	resubmit(entry: ChatEntry, input: Omit<RunAgentInput, 'conversationId'>): Promise<boolean>;
	retry(reply: ChatEntry): Promise<void>;
	decide(reply: ChatEntry, tool: ChatToolActivity, decision: 'approve' | 'reject'): Promise<void>;
	decideAll(
		reply: ChatEntry,
		tools: readonly ChatToolActivity[],
		decision: 'approve' | 'reject'
	): Promise<void>;
	detach(): void;
	release(): void;
	clear(): void;
	switchToConversation(id: ConversationId, resources: WorkspaceResourcesController): Promise<void>;
}
const activeStatuses: readonly AgentRunStatus[] = [
	'queued',
	'running',
	'awaiting_approval',
	'cancelling'
];

const ABANDONED_APPROVAL = 'The run ended before you answered.';
const toolIdentity = (tool: ChatToolActivity) => ({
	callId: tool.callId,
	name: tool.name,
	arguments: tool.arguments,
	...(tool.runId ? { runId: tool.runId } : {})
});

export class ChatSession implements ChatSessionController {
	constructor(
		readonly sessionKey: ChatSessionKey,
		private readonly state: ChatSessionState,
		private readonly transport: AgentRunTransport,
		private readonly storage: AgentRunClientStorage,
		private readonly choices: ChatChoicesStorage,
		private readonly reader: ChatPayloadReader,
		private readonly presentation: ChatTranscript,
		private readonly context: ChatContextCapture,
		private readonly environment: ChatEnvironment,
		private readonly chipRules: ChatChipRules
	) {}
	private isCurrent(generation: number): boolean {
		return (
			!this.state.released &&
			generation === this.state.generation &&
			(this.state.resources === null || this.state.resources.active)
		);
	}
	get canExecute(): boolean {
		return (
			!this.state.released &&
			this.environment.online &&
			!this.state.loading &&
			(this.state.resources === null ||
				(this.state.resources.active && this.state.resources.online)) &&
			this.state.liveConfirmed
		);
	}
	get isStreaming(): boolean {
		return this.state.runStatus !== undefined && activeStatuses.includes(this.state.runStatus);
	}
	get entries(): readonly ChatEntry[] {
		return this.state.entries;
	}
	get loading(): boolean {
		return this.state.loading;
	}
	get conversationId(): ConversationId | undefined {
		return this.state.conversationId;
	}
	get modelOverride(): string | null {
		return this.state.modelOverride;
	}
	get visionModelOverride(): string | null {
		return this.state.visionModelOverride;
	}
	get executionModeOverride(): AgentExecutionMode {
		return this.state.executionModeOverride;
	}
	get initialized(): boolean {
		return this.state.initialized;
	}
	get deciding(): boolean {
		return this.state.deciding;
	}
	get chips(): readonly ContextChip[] {
		return this.state.chips;
	}
	get mentionDraft(): MentionHistory {
		return this.state.mentionDraft;
	}
	get autoChipDismissedFor(): string | undefined {
		return this.state.autoChipDismissedFor;
	}
	get dismissedSelectionId(): string | undefined {
		return this.state.dismissedSelectionId;
	}
	get staged(): ChatHandoff | undefined {
		return this.state.staged;
	}
	get runId(): AgentRunId | undefined {
		return this.state.runId;
	}
	get runStatus(): AgentRunStatus | undefined {
		return this.state.runStatus;
	}
	get cursor(): string {
		return this.state.cursor;
	}
	get attempt(): number {
		return this.state.attempt;
	}
	get connection(): 'detached' | 'connected' | 'reconnecting' | 'offline' {
		return this.state.connection;
	}
	get persistenceError(): string | undefined {
		return this.state.persistenceError;
	}
	get historyError(): string | null {
		return this.state.historyError;
	}

	consumeStaged(): ChatHandoff | undefined {
		const request = this.state.staged;
		this.state.staged = undefined;
		return request;
	}
	setChips(chips: readonly ContextChip[]): void {
		this.state.chips = [...chips];
	}
	setMentionDraft(history: MentionHistory): void {
		this.state.mentionDraft = history;
	}
	dismissAutoChip(key: string): void {
		this.state.autoChipDismissedFor = key;
	}
	dismissSelection(id: string): void {
		this.state.dismissedSelectionId = id;
	}
	chooseModel(model: string | null): void {
		this.state.modelOverride = model;
		this.persistConversationChoices();
	}
	chooseVisionModel(model: string | null): void {
		this.state.visionModelOverride = model;
		this.persistConversationChoices();
	}
	chooseExecutionMode(mode: AgentExecutionMode): void {
		this.state.executionModeOverride = mode;
		this.persistConversationChoices();
	}
	release(): void {
		this.state.generation++;
		this.state.released = true;
		this.state.refreshing = null;
		this.state.hydrating = null;
		this.state.resources = null;
		this.detach();
	}
	initialize(defaultMode: AgentExecutionMode): void {
		this.state.defaultExecutionMode = defaultMode;
		if (this.state.initialized) return;
		const persisted = this.choices.load();
		if (persisted.kind === 'corrupt')
			this.state.persistenceError = `Saved chat settings were corrupt. Reset them to continue safely. ${persisted.message}`;
		const choices = persisted.kind === 'valid' ? persisted.choices : {};
		this.state.conversationId = choices.conversationId;
		this.state.modelOverride = choices.modelOverride ?? null;
		this.state.visionModelOverride = choices.visionModelOverride ?? null;
		this.state.executionModeOverride = choices.executionModeOverride ?? defaultMode;
		this.state.initialized = true;
	}

	/**
	 * Write a prompt into the composer without sending it. The sentence is the point:
	 * the user reads what the agent is about to be asked, edits it if they want, and
	 * presses Enter. Nothing runs until they do.
	 */
	stage(request: ChatHandoff): void {
		this.state.staged = request;
	}

	hydrate(resources: WorkspaceResourcesController): Promise<void> {
		if (this.state.hydrating?.generation === this.state.generation)
			return this.state.hydrating.promise;
		const operation = {
			generation: this.state.generation,
			promise: this.hydrateHistory(resources)
		};
		this.state.hydrating = operation;
		return operation.promise.finally(() => {
			if (this.state.hydrating === operation) this.state.hydrating = null;
		});
	}

	private async hydrateHistory(resources: WorkspaceResourcesController): Promise<void> {
		this.state.resources = resources;
		if (!this.state.conversationId || this.state.released) return;
		if (this.isStreaming && this.state.eventConnection) return;
		const conversationId = this.state.conversationId;
		const generation = this.state.generation;
		this.state.liveConfirmed = false;
		this.state.historyError = null;
		this.state.loading = true;
		try {
			const opened = await resources.open({ type: 'conversations', id: [conversationId] });
			if (opened.kind !== 'ready') throw new Error(accessMessage(opened, 'chat'));
			if (!this.isCurrent(generation) || !resources.active) return;
			if (this.state.hydratedConversationId === conversationId && this.state.eventConnection) {
				this.state.loading = false;
				await this.revalidate();
				return;
			}
			await resources.prepare();
			if (!this.isCurrent(generation) || !resources.active) return;
			const conversation = resources.views.conversation(conversationId);
			if (!conversation) throw new Error('This chat is no longer available');
			const run = resources.views.latestRun(conversationId);
			const data = {
				conversation,
				messages: resources.views.messages(conversationId),
				latestRun: run ? { run, pendingDecisions: run.pendingDecisions } : null
			};
			// The conversation's own settings, not the ones the last chat left behind.
			// These were read from `sessionStorage` and never reconciled with the row
			// the server actually resolves the run against, so the composer could read
			// "Approval" over a conversation set to auto-accept, and name a model no
			// run on it would use.
			this.state.modelOverride = data.conversation.modelOverride ?? null;
			this.state.visionModelOverride = data.conversation.visionModelOverride ?? null;
			this.state.executionModeOverride =
				data.conversation.executionModeOverride ?? this.state.defaultExecutionMode;
			// The latest run is the only one that can still be waiting on the user: a
			// conversation runs one at a time, so nothing older holds a live question.
			const awaiting =
				data.latestRun?.run.status === 'awaiting_approval' ? data.latestRun.run.id : undefined;
			this.state.entries = this.presentation.restore(this.reader.messages(data.messages), awaiting);
			if (data.latestRun) {
				const snapshot = data.latestRun;
				this.state.runId = snapshot.run.id;
				this.state.runStatus = snapshot.run.status;
				let reply = this.state.entries.findLast(
					(entry) => entry.role === 'assistant' && entry.runId === snapshot.run.id
				);
				if (!reply && snapshot.run.status !== 'completed') {
					this.state.entries.push({
						id: this.environment.id(),
						role: 'assistant',
						parts: [],
						suggestions: [],
						status: 'waiting',
						runId: snapshot.run.id
					});
					// Re-read through the $state proxy: mutating the raw pushed object bypasses reactivity.
					reply = this.state.entries[this.state.entries.length - 1];
				}
				if (reply) {
					this.state.activeReply = reply;
					this.reconcileSnapshot(reply, snapshot);
				}
			}
			this.state.hydratedConversationId = conversationId;
			this.state.loading = false;
			await this.revalidate();
			// audit-allow: silent-catch — hydration failure moves the store to an explicit reconnecting/offline state rather than an empty chat.
		} catch (error) {
			if (!this.isCurrent(generation)) return;
			this.state.historyError =
				error instanceof Error ? error.message : 'Chat history could not be opened';
			this.state.connection = this.environment.online ? 'reconnecting' : 'offline';
		} finally {
			if (this.isCurrent(generation)) this.state.loading = false;
		}
	}

	/** Cached history is readable offline; execution resumes only after a live server check. */
	revalidate(): Promise<void> {
		if (
			!this.environment.online ||
			(this.state.resources && (!this.state.resources.active || !this.state.resources.online))
		) {
			this.detach();
			this.state.connection = 'offline';
			this.state.liveConfirmed = false;
			return Promise.resolve();
		}
		if (!this.state.runId) {
			this.state.liveConfirmed = true;
			return Promise.resolve();
		}
		if (this.state.refreshing) return this.state.refreshing;
		const operation = this.validateRun().then(() => undefined);
		this.state.refreshing = operation;
		return operation.finally(() => {
			if (this.state.refreshing === operation) this.state.refreshing = null;
		});
	}
	private async validateRun(): Promise<void | { kind: 'failure' }> {
		const runId = this.state.runId;
		const generation = this.state.generation;
		if (!runId) return;
		try {
			const snapshot = await this.transport.get(runId);
			if (
				!this.isCurrent(generation) ||
				this.state.runId !== runId ||
				(this.state.resources && (!this.state.resources.active || !this.state.resources.online))
			)
				return;
			this.state.liveConfirmed = true;
			this.state.historyError = null;
			const reply = this.state.activeReply;
			if (reply) this.reconcileSnapshot(reply, snapshot);
			if (reply && activeStatuses.includes(snapshot.run.status) && !this.state.eventConnection) {
				const stored = this.storage.load();
				if (stored.kind === 'corrupt') this.state.persistenceError = stored.message;
				const saved =
					stored.kind === 'valid' && stored.state.runId === runId
						? stored.state
						: { cursor: '0', attempt: 0 };
				this.attach(reply, runId, saved.cursor, saved.attempt);
			}
		} catch (error) {
			if (!this.isCurrent(generation)) return;
			this.state.liveConfirmed = false;
			this.state.connection = this.environment.online ? 'reconnecting' : 'offline';
			this.state.historyError =
				error instanceof Error ? error.message : 'The live run could not be checked';
			return { kind: 'failure' };
		}
	}

	resetCorruptPersistence(): void {
		this.choices.clear();
		this.storage.clear();
		this.state.persistenceError = undefined;
	}

	persistConversationChoices(): void {
		if (!this.state.initialized) return;
		this.choices.save({
			conversationId: this.state.conversationId,
			modelOverride: this.state.modelOverride,
			visionModelOverride: this.state.visionModelOverride,
			executionModeOverride: this.state.executionModeOverride
		});
	}

	addChip(chip: ContextChip): void {
		if (!this.state.chips.some((known) => known.kind === chip.kind && known.id === chip.id))
			this.state.chips = [...this.state.chips, chip];
	}

	removeChip(chip: ContextChip): void {
		this.state.chips = this.state.chips.filter(
			(known) => known.kind !== chip.kind || known.id !== chip.id
		);
	}

	/**
	 * Drop a suggestion card once it has been accepted or rejected. The note tray
	 * does this through its own registry; a decision made from the panel with no
	 * note open has to say so here, or the card outlives the thing it proposed.
	 */
	async decideSuggestion(
		id: SuggestionId,
		decision: 'accept' | 'reject',
		decide: (id: SuggestionId, decision: 'accept' | 'reject') => Promise<boolean>
	): Promise<boolean> {
		const generation = this.state.generation;
		const succeeded = await decide(id, decision);
		if (succeeded && this.isCurrent(generation)) this.resolveSuggestion(id);
		return succeeded;
	}
	resolveSuggestion(suggestionId: string): void {
		for (const entry of this.state.entries)
			entry.suggestions = entry.suggestions.filter((view) => view.suggestion.id !== suggestionId);
	}

	async send(
		input: Omit<RunAgentInput, 'conversationId'> & { readonly retryUserOrdinal?: number }
	): Promise<void> {
		if (!this.canExecute || this.isStreaming) return;
		const generation = this.state.generation;
		const requestId = this.environment.id();
		const noteChips = this.state.chips.flatMap((chip) => (chip.kind === 'note' ? [chip.id] : []));
		const skillChips = this.state.chips.flatMap((chip) => (chip.kind === 'skill' ? [chip.id] : []));
		const contextResources = this.chipRules.unique([
			...(input.contextResources ?? []),
			...this.state.chips.flatMap((chip) => this.chipRules.resources(chip))
		]);
		// The singular `selection` is derived here and nowhere else. It stays on the wire
		// because the selection-bound tools (extract_promises, relate_selection, …) are offered
		// only when the run input has one; the plural field is what the prompt actually quotes.
		//
		// Pinned passages come first, so a pin takes that singular slot ahead of the passage
		// merely highlighted at the moment of sending: pinning is deliberate, highlighting is
		// incidental, and the tools should act on the one the user meant.
		const selections = [
			...this.state.chips
				.filter((chip): chip is SelectionChip => chip.kind === 'selection')
				.map((chip) => chip.selection),
			...(input.selections ?? [])
		];
		this.storage.save({ cursor: '0', attempt: 0, pendingRequestId: requestId });
		this.state.entries.push({
			id: this.environment.id(),
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
		this.state.entries.push({
			id: this.environment.id(),
			role: 'assistant',
			parts: [],
			suggestions: [],
			status: 'queued'
		});
		// Re-read through the $state proxy: mutating the raw pushed object bypasses reactivity.
		const reply = this.state.entries[this.state.entries.length - 1]!;
		this.state.activeReply = reply;
		this.state.runStatus = 'queued';
		try {
			const contextSnapshot = this.context.capture();
			const receipt = await this.transport.submit({
				requestId,
				input: input.prompt,
				...(input.images?.length ? { images: input.images } : {}),
				// Deliberately not echoed into `entries` above: the transcript shows
				// what the user sent, and this is context the app supplied.
				...(input.contextImages?.length ? { contextImages: input.contextImages } : {}),
				...(this.state.conversationId ? { conversationId: this.state.conversationId } : {}),
				model: this.state.modelOverride,
				visionModel: this.state.visionModelOverride,
				mode: this.state.executionModeOverride,
				appContext: contextSnapshot,
				...(input.projectId ? { projectId: input.projectId } : {}),
				...(input.noteId ? { noteId: input.noteId } : {}),
				...(selections.length ? { selections, selection: selections[0] } : {}),
				contextNoteIds: [...new Set([...(input.contextNoteIds ?? []), ...noteChips])],
				...(contextResources.length ? { contextResources } : {}),
				...(input.requestedSkillNames ? { requestedSkillNames: input.requestedSkillNames } : {}),
				requestedSkillNoteIds: [
					...new Set([...(input.requestedSkillNoteIds ?? []), ...skillChips])
				],
				...(input.retryUserOrdinal !== undefined
					? { retryUserOrdinal: input.retryUserOrdinal }
					: {})
			});
			if (!this.isCurrent(generation)) return;
			this.state.conversationId = receipt.conversationId;
			reply.runId = receipt.runId;
			this.state.runStatus = receipt.status;
			this.persistConversationChoices();
			this.attach(reply, receipt.runId, receipt.latestCursor, 0);
			// audit-allow: silent-catch — submission failure is attached to the pending reply and connection state exposes uncertainty.
		} catch (error) {
			if (!this.isCurrent(generation) || this.state.released) return;
			const rejected =
				typeof error === 'object' && error !== null
					? this.environment.rejectionMessage(error)
					: undefined;
			reply.error = rejected ?? 'Submission could not be confirmed. Reconnect to check its status.';
			if (!rejected) this.state.connection = this.environment.online ? 'reconnecting' : 'offline';
			this.state.runStatus = undefined;
		}
	}

	async stop(): Promise<void> {
		if (!this.canExecute || !this.state.runId) return;
		const runId = this.state.runId;
		const generation = this.state.generation;
		const reply = this.state.activeReply;
		if (reply) reply.status = 'cancelling';
		this.state.runStatus = 'cancelling';
		try {
			const snapshot = await this.transport.cancel(runId);
			if (!this.isCurrent(generation)) return;
			if (reply) this.reconcileSnapshot(reply, snapshot);
			// audit-allow: silent-catch — an unconfirmed cancel triggers an explicit server reconciliation attempt.
		} catch {
			// The cancel may still have landed server-side, so ask before giving up:
			// `cancelling` gates the composer and must never be a resting state here.
			try {
				const snapshot = await this.transport.get(runId);
				if (!this.isCurrent(generation)) return;
				if (reply) this.reconcileSnapshot(reply, snapshot);
				// audit-allow: silent-catch — failed reconciliation marks cancellation unconfirmed instead of claiming success.
			} catch {
				if (!this.isCurrent(generation)) return;
				if (reply) reply.error = 'Cancellation has not been confirmed yet.';
				this.state.runStatus = undefined;
			}
		}
	}

	/**
	 * The user turn a reply answers, so an answer can be asked again with the
	 * question that produced it.
	 */
	precedingUserEntry(reply: ChatEntry): ChatEntry | undefined {
		const index = this.state.entries.findIndex((entry) => entry.id === reply.id);
		if (index < 0) return undefined;
		return this.state.entries.slice(0, index).findLast((entry) => entry.role === 'user');
	}

	/**
	 * One-based position of a user turn among the user turns. This, rather than an
	 * id, is how the server addresses the turn to rewind to: an optimistically sent
	 * entry carries a client uuid, not the message id the server assigned it.
	 */
	private userOrdinalOf(entry: ChatEntry): number | undefined {
		let ordinal = 0;
		for (const candidate of this.state.entries) {
			if (candidate.role !== 'user') continue;
			ordinal += 1;
			if (candidate.id === entry.id) return ordinal;
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
		const index = this.state.entries.findIndex((candidate) => candidate.id === entry.id);
		if (ordinal === undefined || index < 0) return false;
		this.state.entries = this.state.entries.slice(0, index);
		await this.send({ ...input, retryUserOrdinal: ordinal });
		return true;
	}

	async retry(entry: ChatEntry): Promise<void> {
		const reply = this.state.entries.find((candidate) => candidate.id === entry.id);
		if (!reply) return;
		if (!this.canExecute || this.isStreaming || !reply.runId) return;
		const generation = this.state.generation;
		const receipt = await this.transport.retry(reply.runId, this.environment.id());
		if (!this.isCurrent(generation)) return;
		reply.status = 'queued';
		reply.error = undefined;
		reply.retryable = false;
		this.state.activeReply = reply;
		this.state.runStatus = receipt.status;
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
		entry: ChatEntry,
		tools: readonly ChatToolActivity[],
		decision: 'approve' | 'reject'
	): Promise<void> {
		const reply = this.state.entries.find((candidate) => candidate.id === entry.id);
		if (!reply || !this.canExecute || this.state.deciding) return;
		const runId = tools.find((tool) => tool.runId)?.runId;
		// A call the run could not name is a call the server cannot match a decision
		// to, so it is not sent. Parked approvals always carry one.
		const callIds = tools
			.map((tool) => tool.callId)
			.filter((callId): callId is string => callId !== undefined);
		if (!runId || callIds.length === 0) return;
		this.state.deciding = true;
		const generation = this.state.generation;
		try {
			const snapshot = await this.transport.decideMany({
				runId: runId as AgentRunId,
				callIds,
				decision
			});
			if (!this.isCurrent(generation)) return;
			// Replaced, not edited: an approved call is `running` and a refused one is
			// `rejected`, and neither is the arm the parked row was in.
			for (const tool of tools)
				this.presentation.applyTool(reply.parts, {
					...toolIdentity(tool),
					status: decision === 'approve' ? 'running' : 'rejected'
				});
			this.reconcileSnapshot(reply, snapshot);
			this.attach(reply, snapshot.run.id, this.state.cursor, this.state.attempt);
			// audit-allow: silent-catch — every affected tool is marked failed so the decision is never presented as applied.
		} catch {
			if (!this.isCurrent(generation)) return;
			for (const tool of tools)
				this.presentation.applyTool(reply.parts, {
					...toolIdentity(tool),
					failure: 'The decision could not be applied.',
					status: 'failed'
				});
		} finally {
			if (this.isCurrent(generation)) this.state.deciding = false;
		}
	}

	detach(): void {
		this.state.connectionGeneration++;
		this.state.eventConnection?.close();
		this.state.eventConnection = undefined;
		this.state.connection = 'detached';
	}

	clear(): void {
		this.state.generation++;
		this.state.refreshing = null;
		this.state.deciding = false;
		this.state.historyError = null;
		this.state.liveConfirmed = true;
		this.detach();
		this.state.entries = [];
		this.state.loading = false;
		this.state.conversationId = undefined;
		this.state.modelOverride = null;
		this.state.visionModelOverride = null;
		this.state.chips = [];
		this.state.mentionDraft = createMentionHistory('');
		this.state.autoChipDismissedFor = undefined;
		this.state.dismissedSelectionId = undefined;
		this.state.hydratedConversationId = undefined;
		this.state.runId = undefined;
		this.state.runStatus = undefined;
		this.state.cursor = '0';
		this.state.attempt = 0;
		this.state.activeReply = undefined;
		this.storage.clear();
		this.choices.clear();
	}

	async switchToConversation(
		id: ConversationId,
		resources: WorkspaceResourcesController
	): Promise<void> {
		if (this.state.conversationId === id) return this.hydrate(resources);
		this.state.generation++;
		this.state.refreshing = null;
		this.state.deciding = false;
		this.state.historyError = null;
		this.detach();
		this.state.entries = [];
		this.state.conversationId = id;
		this.state.hydratedConversationId = undefined;
		// Dropped before the fetch rather than replaced after it: a hydration that
		// fails must leave the composer showing nothing borrowed from the chat being
		// left, not that chat's model and mode over this one's transcript.
		this.state.modelOverride = null;
		this.state.visionModelOverride = null;
		this.state.executionModeOverride = this.state.defaultExecutionMode;
		this.state.chips = [];
		this.state.mentionDraft = createMentionHistory('');
		this.state.autoChipDismissedFor = undefined;
		this.state.dismissedSelectionId = undefined;
		this.state.runId = undefined;
		this.state.runStatus = undefined;
		this.state.activeReply = undefined;
		this.persistConversationChoices();
		await this.hydrate(resources);
	}

	private attach(
		reply: MutableChatEntry,
		runId: AgentRunId,
		cursor: string,
		attempt: number
	): void {
		this.detach();
		this.state.activeReply = reply;
		this.state.runId = runId;
		this.state.cursor = cursor;
		this.state.attempt = attempt;
		this.state.connection = 'reconnecting';
		this.storage.save({ runId, cursor, attempt });
		const generation = this.state.connectionGeneration;
		const sessionGeneration = this.state.generation;
		this.state.appliedCursor = cursor;
		this.state.eventConnection = this.transport.openEvents({
			runId,
			after: cursor,
			onOpen: () => {
				if (generation === this.state.connectionGeneration && this.isCurrent(sessionGeneration))
					this.state.connection = 'connected';
			},
			onEvent: async (record) => {
				if (generation !== this.state.connectionGeneration || !this.isCurrent(sessionGeneration))
					return;
				const event = record.kind === 'readable' ? record.event : undefined;
				const terminal =
					event?.type === 'completed' ||
					event?.type === 'cancelled' ||
					(event?.type === 'failed' && !event.retryable);
				if (event?.type === 'resources_stale' || terminal)
					await this.state.resources?.synchronize();
				if (generation !== this.state.connectionGeneration || !this.isCurrent(sessionGeneration))
					return;
				if (BigInt(record.cursor) > BigInt(this.state.appliedCursor)) {
					if (event) this.apply(reply, event);
					else
						reply.parts.push({
							kind: 'unreadable',
							reason: 'Some saved agent activity could not be restored.'
						});
					this.state.appliedCursor = record.cursor;
				}
				this.storage.save({ runId, cursor: record.cursor, attempt: record.attempt });
				this.state.cursor = record.cursor;
				if (terminal) this.detach();
			},
			onError: () => {
				if (generation === this.state.connectionGeneration && this.isCurrent(sessionGeneration))
					void this.reconcileAfterDisconnect(reply, runId);
			}
		});
	}

	private async reconcileAfterDisconnect(
		reply: MutableChatEntry,
		runId: AgentRunId
	): Promise<void> {
		const generation = this.state.connectionGeneration;
		const sessionGeneration = this.state.generation;
		this.state.connection = this.environment.online ? 'reconnecting' : 'offline';
		try {
			const snapshot = await this.transport.get(runId);
			if (generation !== this.state.connectionGeneration || !this.isCurrent(sessionGeneration))
				return;
			this.reconcileSnapshot(reply, snapshot);
			if (
				!activeStatuses.includes(snapshot.run.status) &&
				BigInt(this.state.cursor) >= BigInt(snapshot.latestCursor)
			) {
				await this.state.resources?.synchronize();
				if (generation === this.state.connectionGeneration) this.detach();
			}
			// audit-allow: silent-catch — refresh failure moves the connection into its visible reconnecting/offline state.
		} catch {
			if (generation !== this.state.connectionGeneration || !this.isCurrent(sessionGeneration))
				return;
			this.state.connection = this.environment.online ? 'reconnecting' : 'offline';
		}
	}

	private reconcileSnapshot(
		reply: MutableChatEntry,
		snapshot: {
			run: Pick<WorkspaceValues['agent_runs'], 'id' | 'status' | 'failure'>;
			pendingDecisions: AgentRunSnapshot['pendingDecisions'];
		}
	): void {
		this.state.runId = snapshot.run.id;
		this.state.runStatus = snapshot.run.status;
		reply.runId = snapshot.run.id;
		for (const tool of this.presentation.entryTools(reply)) {
			if (
				tool.status === 'approval_required' &&
				!snapshot.pendingDecisions.some((pending) => pending.callId === tool.callId)
			)
				this.presentation.applyTool(reply.parts, {
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
				this.presentation.applyTool(reply.parts, {
					callId: pending.callId,
					name: pending.toolName,
					arguments: this.reader.arguments(pending.arguments),
					...(pending.review ? { noteReview: this.reader.review(pending.review) } : {}),
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

	private apply(reply: MutableChatEntry, event: AgentEvent): void {
		if (event.type === 'run_queued') {
			this.state.runStatus = 'queued';
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
			this.state.attempt = event.attempt;
			this.state.runStatus = 'running';
			reply.status = 'waiting';
		} else if (event.type === 'text_delta') {
			reply.status = 'streaming';
			this.presentation.appendText(reply, event.text);
		} else if (event.type === 'reasoning_delta') {
			reply.status = 'streaming';
			this.presentation.appendReasoning(reply, event.text);
		} else if (event.type === 'tool_started') {
			reply.status = 'streaming';
			this.presentation.applyTool(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: this.reader.arguments(event.arguments),
				status: 'running'
			});
		} else if (event.type === 'tool_succeeded') {
			this.presentation.applyTool(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: {},
				...(event.output === undefined ? {} : { output: event.output }),
				status: 'succeeded'
			});
		} else if (event.type === 'tool_reported_failure') {
			this.presentation.applyTool(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: {},
				failure: event.failure,
				output: event.output,
				status: 'reported_failure'
			});
		} else if (event.type === 'tool_failed') {
			this.presentation.applyTool(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: {},
				failure: event.failure,
				status: 'failed'
			});
		} else if (event.type === 'approval_required') {
			this.state.runStatus = 'awaiting_approval';
			reply.status = 'awaiting_approval';
			this.presentation.applyTool(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: this.reader.arguments(event.arguments),
				...(event.review ? { noteReview: this.reader.review(event.review) } : {}),
				runId: event.runId,
				status: 'approval_required'
			});
		} else if (event.type === 'failed') {
			reply.status = event.retryable ? 'queued' : 'failed';
			reply.runId = event.runId ?? reply.runId;
			reply.error = event.message;
			reply.retryable = event.retryable;
			if (!event.retryable) this.state.runStatus = 'failed';
		} else if (event.type === 'cancelled') {
			reply.status = 'cancelled';
			this.state.runStatus = 'cancelled';
			reply.error = event.message;
		} else if (event.type === 'completed') {
			reply.status = 'completed';
			this.state.runStatus = 'completed';
			this.state.conversationId = event.conversationId;
		}
	}
}
