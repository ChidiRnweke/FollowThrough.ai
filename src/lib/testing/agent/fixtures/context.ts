import { RunCheckpoints } from '$lib/server/services/agent/runs/checkpoints';
import { RunPreparation } from '$lib/server/services/agent/runs/preparation';
import { RunApprovals } from '$lib/server/services/agent/runs/approvals';
import { RunCancellation } from '$lib/server/services/agent/runs/cancellation';
import type { ActorContext } from '$lib/models/identity';
import { builtInSkillsFixture } from '$lib/testing/skills/fixtures/built-ins';
import type { AgentRunId, RunAgentInput } from '$lib/models/agent';
import type { ProvenanceId } from '$lib/models/provenance';
import { Agent, type AgentDependencies } from '$lib/server/controllers/agent/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { AgentContext } from '$lib/server/services/agent/runs/context';
import { AgentEvents } from '$lib/server/services/agent/runs/events';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { InMemoryAgentRunner, InMemorySkills } from '$lib/testing/agent/fakes/in-memory-agent';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import { InMemoryConversationRepository } from '$lib/testing/agent/fakes/in-memory-conversations';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryProvenanceRecorder } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { noteBuilder, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

/** Exercises context preparation through an executable run, including durable failures. */
export const agentContextFixture = () => {
	const notes = new InMemoryNoteContent();
	notes.notes = [noteBuilder()];
	const skills = new InMemorySkills();
	const projects = new InMemoryProjects();
	const memory = new InMemoryMemoryEntryRepository();
	const conversations = new InMemoryConversationRepository();
	const journal = new ConversationArchive(conversations);
	const runs = new InMemoryAgentRunPersistence();
	const sessions = new InMemoryAgentSessionRepository();
	const transactions = new InMemoryTransactionRunner([runs, sessions, conversations]);
	const dependencies = {
		runs,
		cancellations: new RunCancellation(runs),
		preparation: new RunPreparation(runs),
		checkpoints: new RunCheckpoints(runs),
		approvals: new RunApprovals(runs),
		events: runs,
		decisions: runs,
		sessions,
		transactionRunner: transactions,
		settlements: new RunSettlements(runs, runs),
		contextFormatter: new AgentContext(),
		contextNotes: notes,
		contextSkills: skills,
		builtInSkills: builtInSkillsFixture().builtInSkills,
		contextProjects: projects,
		contextMemory: memory,
		contextConversations: journal,
		provenance: new InMemoryProvenanceRecorder(),
		conversationJournal: journal,
		runner: new InMemoryAgentRunner(),
		eventBus: new AgentEvents()
	};
	const controller = new Agent(capabilityDependencies<AgentDependencies>(dependencies));
	const builder = {
		async build(actor: ActorContext, input: RunAgentInput, origin: { provenanceId: ProvenanceId }) {
			if (!(await conversations.findById(actor, input.conversationId))) {
				const conversation = await journal.createWorkflow(actor, { title: 'Context preparation' });
				conversations.conversations = conversations.conversations.map((value) =>
					value.id === conversation.id ? { ...value, id: input.conversationId } : value
				);
			}
			const id = crypto.randomUUID() as AgentRunId;
			await runs.insert(actor, {
				kind: 'agent',
				id,
				userId: actor.userId,
				conversationId: input.conversationId,
				model: 'test/model',
				executionMode: 'approval_required',
				status: 'queued',
				requestId: crypto.randomUUID(),
				pendingDecisions: [],
				provenanceId: origin.provenanceId,
				inputSnapshot: input,
				definitionVersion: 2,
				createdAt: testNow,
				updatedAt: testNow
			});
			try {
				await controller.execute(id, new AbortController().signal);
			} catch (error) {
				// The submission controller owns this rejection path in production.
				await controller.failRun(id, error instanceof Error ? error : new Error(String(error)));
				throw error;
			}
			const run = await runs.findAgentById(actor, id);
			if (run?.status === 'failed') throw new Error(run.failure);
			if (!run?.contextSnapshot) throw new Error('The run has no prepared context.');
			return run.contextSnapshot;
		}
	};
	return {
		builder,
		controller,
		dependencies,
		runs,
		notes,
		skills,
		projects,
		memory,
		conversations
	};
};
