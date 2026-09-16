import { isDeepStrictEqual } from 'node:util';
import type { ActorContext } from '$lib/models/identity';
import type {
	AgentRun,
	AgentRunId,
	AgentRunReceipt,
	ConversationId,
	PromiseExtractionRunContext,
	ReferenceSearchRunContext,
	RelatedNoteRunContext,
	DiagramActionRunContext,
	NoteActionRequest,
	NoteActionIdentity,
	NoteActionIntent,
	NoteActionRunContext,
	WorkflowAgentRun
} from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import type {
	AgentRunRepository,
	AgentRunEventRepository,
	ConversationRepository
} from '$lib/server/repositories/agent';
import type { NoteActionResult } from '$lib/server/repositories/agent/agent-runs';
export type { NoteActionResult } from '$lib/server/repositories/agent/agent-runs';
import { NotFoundError, ValidationError } from '$lib/errors';

/** The controller rolls back its conversation when another submission wins the request ID. */
export class DuplicateNoteActionRequest extends Error {}

type PromiseRun = WorkflowAgentRun & { readonly contextSnapshot: PromiseExtractionRunContext };
type ReferenceRun = WorkflowAgentRun & { readonly contextSnapshot: ReferenceSearchRunContext };
type RelatedRun = WorkflowAgentRun & { readonly contextSnapshot: RelatedNoteRunContext };
type DiagramRun = WorkflowAgentRun & { readonly contextSnapshot: DiagramActionRunContext };
type NoteActionRun = PromiseRun | ReferenceRun | RelatedRun | DiagramRun;

/** Persists note-action identity and input through actual repositories. Controllers own transactions. */
export class NoteActionRequests {
	constructor(
		private readonly runs: AgentRunRepository,
		private readonly events: AgentRunEventRepository,
		private readonly conversations: ConversationRepository
	) {}

	async prepare(actor: ActorContext, request: NoteActionRequest): Promise<AgentRunReceipt> {
		const existing = await this.runs.findByRequestId(actor, request.requestId);
		if (existing) return this.matchingReceipt(actor, existing, request);
		const timestamp = new Date().toISOString() as DateTime;
		const context = request.context;
		const conversation = await this.conversations.insert(actor, {
			id: crypto.randomUUID() as ConversationId,
			userId: actor.userId,
			kind: 'workflow',
			contextNoteId:
				context.kind === 'diagram_action'
					? context.input.operation === 'generate'
						? context.input.selection.noteId
						: context.input.noteId
					: context.selection.noteId,
			title:
				context.kind === 'diagram_action'
					? context.input.operation === 'generate'
						? 'Generate Mermaid diagram'
						: context.input.operation === 'revise'
							? 'Revise Mermaid diagram'
							: 'Convert Mermaid to draw.io'
					: context.kind === 'promise_extraction'
						? 'Extract promises'
						: context.kind === 'reference_search'
							? 'Find references'
							: 'Find related notes',
			createdAt: timestamp,
			updatedAt: timestamp
		});
		const run: WorkflowAgentRun = {
			id: crypto.randomUUID() as AgentRunId,
			userId: actor.userId,
			kind: 'workflow',
			conversationId: conversation.id,
			model:
				context.kind === 'reference_search' || context.kind === 'diagram_action'
					? context.model
					: context.generation.kind === 'model'
						? context.generation.model
						: 'deterministic',
			executionMode: 'auto_accept',
			status: 'queued',
			requestId: request.requestId,
			pendingDecisions: [],
			contextSnapshot: context,
			definitionVersion: 3,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		if (!(await this.runs.insertIdempotent(actor, run))) throw new DuplicateNoteActionRequest();
		const queued = await this.events.append(run.id, 1, {
			type: 'run_queued',
			runId: run.id,
			attempt: 1,
			reason: 'submitted'
		});
		return {
			runId: run.id,
			conversationId: conversation.id,
			status: 'queued',
			latestCursor: queued.cursor
		};
	}

	async existing(actor: ActorContext, request: NoteActionRequest): Promise<AgentRunReceipt> {
		const run = await this.runs.findByRequestId(actor, request.requestId);
		if (!run) throw new NotFoundError('The note action request was not found');
		return this.matchingReceipt(actor, run, request);
	}

	async findExisting(
		actor: ActorContext,
		request: NoteActionIdentity
	): Promise<AgentRunReceipt | undefined> {
		const run = await this.runs.findByRequestId(actor, request.requestId);
		return run ? this.matchingReceipt(actor, run, request) : undefined;
	}

	claim(
		actor: ActorContext,
		runId: AgentRunId,
		kind: 'promise_extraction'
	): Promise<PromiseRun | undefined>;
	claim(
		actor: ActorContext,
		runId: AgentRunId,
		kind: 'reference_search'
	): Promise<ReferenceRun | undefined>;
	claim(
		actor: ActorContext,
		runId: AgentRunId,
		kind: 'related_notes'
	): Promise<RelatedRun | undefined>;
	async claim(
		actor: ActorContext,
		runId: AgentRunId,
		kind: 'diagram_action'
	): Promise<DiagramRun | undefined>;
	async claim(
		actor: ActorContext,
		runId: AgentRunId,
		kind: NoteActionRunContext['kind']
	): Promise<NoteActionRun | undefined> {
		const run = await this.runs.findById(actor, runId);
		if (!run || run.kind !== 'workflow' || run.contextSnapshot.kind !== kind)
			throw new NotFoundError('The note action run was not found');
		const claimed = await this.runs.transition(runId, 'queued', 'running', {
			startedAt: new Date().toISOString() as DateTime
		});
		if (!claimed) return undefined;
		if (claimed.kind !== 'workflow' || claimed.contextSnapshot.kind !== kind)
			throw new ValidationError('The claimed run belongs to a different note action');
		await this.events.append(runId, 1, { type: 'run_started', runId, attempt: 1 });
		if (claimed.contextSnapshot.kind === 'promise_extraction')
			return { ...claimed, contextSnapshot: claimed.contextSnapshot };
		if (claimed.contextSnapshot.kind === 'reference_search')
			return { ...claimed, contextSnapshot: claimed.contextSnapshot };
		if (claimed.contextSnapshot.kind === 'related_notes')
			return { ...claimed, contextSnapshot: claimed.contextSnapshot };
		if (claimed.contextSnapshot.kind === 'diagram_action')
			return { ...claimed, contextSnapshot: claimed.contextSnapshot };
		throw new ValidationError('The claimed run has no saved note-action input');
	}

	async queued(
		kind: NoteActionRunContext['kind']
	): Promise<readonly { actor: ActorContext; runId: AgentRunId }[]> {
		return (await this.runs.listQueuedWorkflows()).flatMap((run) =>
			run.contextSnapshot.kind === kind ? [{ actor: { userId: run.userId }, runId: run.id }] : []
		);
	}

	async recordResult(runId: AgentRunId, result: NoteActionResult): Promise<void> {
		await this.events.appendNoteActionResult(runId, result);
	}

	private intent(context: NoteActionIntent) {
		if (context.kind === 'diagram_action') return { kind: context.kind, input: context.input };
		return context.kind === 'promise_extraction'
			? {
					kind: context.kind,
					selection: context.selection,
					...(context.responsibility ? { responsibility: context.responsibility } : {})
				}
			: { kind: context.kind, selection: context.selection };
	}

	private async matchingReceipt(
		actor: ActorContext,
		run: AgentRun,
		request: NoteActionIdentity
	): Promise<AgentRunReceipt> {
		if (
			run.kind !== 'workflow' ||
			(run.contextSnapshot.kind !== 'promise_extraction' &&
				run.contextSnapshot.kind !== 'reference_search' &&
				run.contextSnapshot.kind !== 'related_notes' &&
				run.contextSnapshot.kind !== 'diagram_action') ||
			!isDeepStrictEqual(this.intent(run.contextSnapshot), this.intent(request.context))
		)
			throw new ValidationError('This request ID already belongs to a different operation');
		return {
			runId: run.id,
			conversationId: run.conversationId,
			status: run.status,
			latestCursor: await this.events.latestCursor(actor, run.id)
		};
	}
}
