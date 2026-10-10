import { createToolActivityProjection } from '$lib/server/factories/agent/tool-activity-factory';
import { DiagramGenerationStore } from '$lib/server/stores/diagrams/generation';
import { createAgentStream } from '$lib/server/factories/agent/stream-factory';
import { InMemoryMermaidSyntaxReader } from '$lib/testing/diagrams/fakes/mermaid-syntax';
import { createTestAgentContext as createAgentContext } from '$lib/testing/agent/fixtures/context-formatter';
import { DiagramRunContext } from '$lib/server/services/diagrams/run-context';
import type { DiagramAgentDependencies } from '$lib/server/controllers/diagrams/controller';
import { builtInSkillsFixture } from '$lib/testing/skills/fixtures/built-ins';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { AgentRunLedger } from '$lib/server/services/agent/runs/ledger';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import { AgentModelSelectionService } from '$lib/services/agent/model-selection';

import { MermaidSubmissionValidator } from '$lib/server/services/diagrams/submission-validation';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryConversationRepository } from '$lib/testing/agent/fakes/in-memory-conversations';
import { InMemoryAgentPreferencesRepository } from '$lib/testing/agent/fakes/in-memory-inline-completion';
import { InMemoryModelCatalog } from '$lib/testing/agent/fakes/in-memory-model-catalog';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryProvenanceRecorder } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemoryDiagramGeneration } from '$lib/testing/diagrams/fakes/in-memory-generation';
import { noteBuilder, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

export const diagramGenerationFixture = () => {
	const persistence = new InMemoryAgentRunPersistence();
	const conversations = new InMemoryConversationRepository();
	const notes = new InMemoryNoteContent();
	notes.notes = [noteBuilder()];
	const skills = builtInSkillsFixture();
	const provider = new InMemoryDiagramGeneration();
	const provenance = new InMemoryProvenanceRecorder();
	const models = new InMemoryModelCatalog();
	models.models = [
		{
			id: 'test/model',
			name: 'Test model',
			provider: 'test',
			supportsTools: true,
			supportsVision: false,
			recommended: false,
			capabilities: ['tools']
		}
	];
	const generation: DiagramAgentDependencies = {
		toolActivityProjection: createToolActivityProjection(),
		contextFormatter: createAgentContext(),
		contextNotes: notes,
		contextSkills: skills.skillFinder,
		contextMemory: new InMemoryMemoryEntryRepository(),
		conversations: new ConversationArchive(conversations),
		conversationMessages: new ConversationArchive(conversations),
		preferences: new AgentPreferenceCatalog(new InMemoryAgentPreferencesRepository()),
		models,
		runs: new AgentRunLedger(persistence),
		runContext: new DiagramRunContext(persistence),
		provenance,
		builtInSkills: skills.builtInSkills,
		defaultModel: 'test/model',
		defaultVisionModel: 'test/vision',
		modelSelection: new AgentModelSelectionService(),
		createStream: createAgentStream,
		observeWorkflow: (_name, _context, operation) => operation(),
		createGenerationState: () => new DiagramGenerationStore(),
		generator: provider
	};
	return {
		models,
		generation,
		provider,
		persistence,
		conversations,
		provenance,
		notes,
		mermaidValidator: new MermaidSubmissionValidator(new InMemoryMermaidSyntaxReader()),
		now: () => testNow
	};
};
