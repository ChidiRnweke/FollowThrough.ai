import type { DiagramAgentDependencies } from '$lib/server/controllers/diagrams/controller';
import { AgentContext } from '$lib/server/services/agent/runs/context';
import { BaseAgentContext } from '$lib/server/services/agent/runs/base-context';
import { AgentRunLedger } from '$lib/server/services/agent/runs/ledger';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import {
	AgentPreferenceCatalog,
	resolveAgentModel
} from '$lib/server/services/agent/runs/preferences';
import { AgentToolEventMapper } from '$lib/server/services/agent/runs/reasoning';
import { MermaidSubmissionValidator } from '$lib/server/services/diagrams/submission-validation';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryConversationRepository } from '$lib/testing/agent/fakes/in-memory-conversations';
import { InMemoryAgentPreferencesRepository } from '$lib/testing/agent/fakes/in-memory-inline-completion';
import { InMemorySkills } from '$lib/testing/agent/fakes/in-memory-agent';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryProvenanceRecorder } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemoryDiagramGeneration } from '$lib/testing/diagrams/fakes/in-memory-generation';
import { noteBuilder, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

export const diagramGenerationFixture = () => {
	const persistence = new InMemoryAgentRunPersistence();
	const conversations = new InMemoryConversationRepository();
	const notes = new InMemoryNoteContent();
	const skillNote = noteBuilder({
		id: testNoteId(99),
		kind: 'skill',
		plainText: 'Create editable diagrams.'
	});
	notes.notes = [noteBuilder(), skillNote];
	const skills = new InMemorySkills();
	skills.skills = [
		{
			note: skillNote,
			name: 'diagramming',
			description: 'Draw diagrams',
			triggerHints: [],
			isEnabled: true
		}
	];
	const provider = new InMemoryDiagramGeneration();
	const provenance = new InMemoryProvenanceRecorder();
	const generation: DiagramAgentDependencies = {
		contextBuilder: new AgentContext(new BaseAgentContext(notes), skills, notes),
		conversations: new ConversationArchive(conversations),
		preferences: new AgentPreferenceCatalog(new InMemoryAgentPreferencesRepository()),
		models: {
			async list() {
				return [
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
			}
		},
		runs: new AgentRunLedger(persistence),
		provenance,
		builtInSkills: { load: (actor) => skills.load(actor, skillNote.id) },
		defaultModel: 'test/model',
		defaultVisionModel: 'test/vision',
		resolveModel: resolveAgentModel,
		createToolEventMapper: () => new AgentToolEventMapper(),
		observeWorkflow: (_name, _context, operation) => operation(),
		generator: provider
	};
	return {
		generation,
		provider,
		persistence,
		conversations,
		provenance,
		notes,
		mermaidValidator: new MermaidSubmissionValidator(async () => {}),
		now: () => testNow
	};
};
