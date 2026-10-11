import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { AgentRunHarnessRecords } from '$lib/server/services/agent/runs/records';
import { RunTransitions } from '$lib/server/services/agent/runs/transitions';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { ToolActivityProjection } from '$lib/server/services/agent/conversations/tool-activity';
import { AgentFileReferenceService } from '$lib/server/services/agent-files/virtual-files';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { ConversationHistoryService } from '$lib/server/services/agent/conversations/history';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { createTestAgentContext as createAgentContext } from '$lib/testing/agent/fixtures/context-formatter';
import { CHAT_WEB_SEARCH_DEFAULTS } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import { builtInSkillsFixture } from '$lib/testing/skills/fixtures/built-ins';
import type { AgentRun, AgentRunId, RunAgentInput } from '$lib/models/agent';
import type { ProvenanceId } from '$lib/models/provenance';
import {
	AgentSdkHarness,
	type AgentHarnessDependencies
} from '$lib/server/controllers/agent/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { RunSignalService } from '$lib/server/services/agent/runs/signals';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { InMemorySkills } from '$lib/testing/agent/fakes/in-memory-agent';
import { InMemoryAgentTurns } from '$lib/testing/agent/fakes/in-memory-agent-turns';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';
import { harnessTurnDependencies } from '$lib/testing/agent/fixtures/harness';
import { InMemoryContextResources } from '$lib/testing/agent/fakes/in-memory-context-resources';
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
export const agentContextFixture = (overrides: Partial<AgentHarnessDependencies> = {}) => {
	const notes = new InMemoryNoteContent(testActor());
	notes.notes = [noteBuilder()];
	const skills = new InMemorySkills();
	const resources = new InMemoryContextResources();
	const projects = new InMemoryProjects(testActor());
	const memory = new InMemoryMemoryEntryRepository(testActor());
	const conversations = new InMemoryConversationRepository(testActor());
	const journal = new ConversationArchive(testActor(), conversations, testClock);
	const runs = new InMemoryAgentRunPersistence(testActor());
	const turns = new InMemoryAgentTurns();
	const sessions = new InMemoryAgentSessionRepository();
	const transactions = new InMemoryTransactionRunner([runs, sessions, conversations]);
	const dependencies = {
		records: new AgentRunHarnessRecords(runs, runs, runs, sessions),
		transitions: new RunTransitions(runs),
		webSearchOverrides: CHAT_WEB_SEARCH_DEFAULTS,
		transactionRunner: transactions,
		settlements: new RunSettlements(runs, runs),
		contextFormatter: createAgentContext(),
		contextNotes: notes,
		contextSkills: skills,
		contextWidgets: resources.widgetReader,
		contextDiagrams: resources.diagramReader,
		contextAttachments: resources.attachmentReader,
		contextFiles: new AgentFileReferenceService(testTokenizer),
		builtInSkills: builtInSkillsFixture().builtInSkills,
		contextProjects: projects,
		contextMemory: memory,
		conversationSessions: journal,
		provenance: new InMemoryProvenanceRecorder(testActor()),
		conversationMessages: journal,
		toolActivity: new ToolActivityProjection(),
		traceContext: { activeTraceparent: () => undefined },
		...harnessTurnDependencies(
			turns,
			new ConversationHistoryService(sessions, new InMemoryAgentFiles(testActor()), testTokenizer)
		),
		runSignals: new RunSignalService(runs, runs)
	};
	const controller = new AgentSdkHarness(
		testActor(),
		new WorkspaceCommandRulesService(),
		capabilityDependencies<AgentHarnessDependencies>({
			now: testClock,
			...dependencies,
			...agentRulesFixture(),
			...overrides
		})
	);
	const builder = {
		async build(
			actor: ActorContext,
			input: RunAgentInput,
			origin: { provenanceId: ProvenanceId },
			parked: AgentRun['pendingDecisions'] = [],
			signal: AbortSignal = new AbortController().signal
		) {
			if (!(await conversations.findById(input.conversationId))) {
				const conversation = await journal.createWorkflow({ title: 'Context preparation' });
				conversations.conversations = conversations.conversations.map((value) =>
					value.id === conversation.id ? { ...value, id: input.conversationId } : value
				);
			}
			const id = crypto.randomUUID() as AgentRunId;
			await runs.insert({
				kind: 'agent',
				id,
				userId: actor.userId,
				conversationId: input.conversationId,
				model: 'test/model',
				executionMode: 'approval_required',
				status: 'queued',
				requestId: crypto.randomUUID(),
				pendingDecisions: parked,
				provenanceId: origin.provenanceId,
				inputSnapshot: input,
				definitionVersion: 2,
				createdAt: testNow,
				updatedAt: testNow
			});
			try {
				const outcome = await controller.execute(id, signal);
				if (outcome === 'cancelled') throw new Error('The run was cancelled');
			} catch (error) {
				// The submission controller owns this rejection path in production.
				await controller.failRun(id, error instanceof Error ? error : new Error(String(error)));
				throw error;
			}
			const run = await runs.findAgentById(id);
			if (run?.status === 'failed') throw new Error(run.failure);
			if (!run?.contextSnapshot) throw new Error('The run has no prepared context.');
			return run.contextSnapshot;
		}
	};
	return {
		builder,
		controller,
		dependencies,
		turns,
		runs,
		sessions,
		notes,
		skills,
		resources,
		projects,
		memory,
		conversations
	};
};
