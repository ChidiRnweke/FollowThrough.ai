import { isDeepStrictEqual } from 'node:util';
import type { PromiseGeneration } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { StartExtractPromisesInput } from '$lib/models/todos';
import type { ExtractPromisesOutput } from '$lib/models/todos';
import type { TodoSuggestion } from '$lib/models/suggestions';
import type {
	AgentRun,
	AgentRunId,
	AgentRunReceipt,
	ConversationId,
	PromiseExtractionRunContext,
	WorkflowAgentRun
} from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import type {
	AgentRunRepository,
	AgentRunEventRepository,
	ConversationRepository
} from '$lib/server/repositories/agent';
import { NotFoundError, ValidationError } from '$lib/errors';

/** A competing request committed first; the controller rolls back its new conversation. */
export class DuplicatePromiseRequest extends Error {}

type PromiseRun = WorkflowAgentRun & { readonly contextSnapshot: PromiseExtractionRunContext };

/** Owns request identity and persisted input. The calling controller owns each transaction. */
export class PromiseRequests {
	constructor(
		private readonly runs: AgentRunRepository,
		private readonly events: AgentRunEventRepository,
		private readonly conversations: ConversationRepository
	) {}

	async prepare(
		actor: ActorContext,
		input: StartExtractPromisesInput,
		generation: PromiseGeneration
	): Promise<AgentRunReceipt> {
		const existing = await this.runs.findByRequestId(actor, input.requestId);
		if (existing) return this.matchingReceipt(actor, existing, input);
		const timestamp = new Date().toISOString() as DateTime;
		const conversation = await this.conversations.insert(actor, {
			id: crypto.randomUUID() as ConversationId,
			userId: actor.userId,
			kind: 'workflow',
			contextNoteId: input.selection.noteId,
			title: 'Extract promises',
			createdAt: timestamp,
			updatedAt: timestamp
		});
		const run: PromiseRun = {
			id: crypto.randomUUID() as AgentRunId,
			userId: actor.userId,
			kind: 'workflow',
			conversationId: conversation.id,
			model: generation.kind === 'model' ? generation.model : 'deterministic',
			executionMode: 'auto_accept',
			status: 'queued',
			requestId: input.requestId,
			pendingDecisions: [],
			contextSnapshot: this.context(input, generation),
			definitionVersion: 3,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		if (!(await this.runs.insertIdempotent(actor, run))) throw new DuplicatePromiseRequest();
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

	async existing(actor: ActorContext, input: StartExtractPromisesInput): Promise<AgentRunReceipt> {
		const run = await this.runs.findByRequestId(actor, input.requestId);
		if (!run) throw new NotFoundError('The promise extraction request was not found');
		return this.matchingReceipt(actor, run, input);
	}

	async claim(actor: ActorContext, runId: AgentRunId): Promise<PromiseRun | undefined> {
		const run = await this.runs.findById(actor, runId);
		if (!run || run.kind !== 'workflow' || run.contextSnapshot.kind !== 'promise_extraction')
			throw new NotFoundError('The promise extraction run was not found');
		const claimed = await this.runs.transition(runId, 'queued', 'running', {
			startedAt: new Date().toISOString() as DateTime
		});
		if (!claimed) return undefined;
		if (claimed.kind !== 'workflow' || claimed.contextSnapshot.kind !== 'promise_extraction')
			throw new ValidationError('The claimed run is not a promise extraction');
		await this.events.append(runId, 1, { type: 'run_started', runId, attempt: 1 });
		return { ...claimed, contextSnapshot: claimed.contextSnapshot };
	}

	async queued(): Promise<readonly { actor: ActorContext; runId: AgentRunId }[]> {
		return (await this.runs.listQueuedWorkflows()).flatMap((run) =>
			run.contextSnapshot.kind === 'promise_extraction'
				? [{ actor: { userId: run.userId }, runId: run.id }]
				: []
		);
	}

	async recordResult(
		runId: AgentRunId,
		result: ExtractPromisesOutput<TodoSuggestion>
	): Promise<void> {
		await this.events.appendPromiseResult(runId, result);
	}

	private context(
		input: StartExtractPromisesInput,
		generation: PromiseGeneration
	): PromiseExtractionRunContext {
		return {
			kind: 'promise_extraction',
			generation,
			selection: input.selection,
			...(input.responsibility ? { responsibility: input.responsibility } : {})
		};
	}

	private async matchingReceipt(
		actor: ActorContext,
		run: AgentRun,
		input: StartExtractPromisesInput
	): Promise<AgentRunReceipt> {
		if (
			run.kind !== 'workflow' ||
			run.contextSnapshot.kind !== 'promise_extraction' ||
			!isDeepStrictEqual(run.contextSnapshot, this.context(input, run.contextSnapshot.generation))
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
