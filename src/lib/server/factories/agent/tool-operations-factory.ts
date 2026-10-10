import type { TokenCounter } from '$lib/models/tokenization';
import type { ActorContext } from '$lib/models/identity';
import type { TextSelection } from '$lib/models/notes';
import type { ProvenanceId } from '$lib/models/provenance';
import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
import { AgentProjectChoices } from '$lib/server/controllers/agent/project-choice';
import type { AgentToolContext, McpToolContext } from '$lib/server/controllers/agent/tool-context';
import { AccountToolOperationsController } from '$lib/server/controllers/agent/tool-operations/account';
import { AppToolOperationsController } from '$lib/server/controllers/agent/tool-operations/app';
import type {
	AppToolOperationsSet,
	McpToolOperationsSet,
	SelectionToolOperationsSet,
	SharedToolOperations
} from '$lib/server/controllers/agent/tool-operations/contracts';
import { DeliverablesToolOperationsController } from '$lib/server/controllers/agent/tool-operations/deliverables';
import { DiagramsToolOperationsController } from '$lib/server/controllers/agent/tool-operations/diagrams';
import { McpToolOperationsController } from '$lib/server/controllers/agent/tool-operations/mcp';
import { MemoryAndPreferencesToolOperationsController } from '$lib/server/controllers/agent/tool-operations/memory-and-preferences';
import { NotesToolOperationsController } from '$lib/server/controllers/agent/tool-operations/notes';
import { ProjectsToolOperationsController } from '$lib/server/controllers/agent/tool-operations/projects';
import { RetrievalToolOperationsController } from '$lib/server/controllers/agent/tool-operations/retrieval';
import { SelectionToolOperationsController } from '$lib/server/controllers/agent/tool-operations/selection';
import { SkillsToolOperationsController } from '$lib/server/controllers/agent/tool-operations/skills';
import { SuggestionsToolOperationsController } from '$lib/server/controllers/agent/tool-operations/suggestions';
import { TodosToolOperationsController } from '$lib/server/controllers/agent/tool-operations/todos';
import { WidgetsToolOperationsController } from '$lib/server/controllers/agent/tool-operations/widgets';
import type { AgentToolControllerProvider } from '$lib/server/factories/agent/tool-controller-provider';
import { AgentToolPresentationService } from '$lib/server/services/agent/runs/tool-views';
import { createToolReviews } from './tool-review-factory';
const toolPresentation = new AgentToolPresentationService();
const noteMarkdown = new NodeNoteMarkdown();
export const createSharedToolOperations = (
	factory: AgentToolControllerProvider,
	actor: ActorContext,
	provenanceId: ProvenanceId,
	tokens: TokenCounter
): SharedToolOperations => {
	const reviews = createToolReviews(() => factory.notes(), actor);
	const projectChoice = new AgentProjectChoices(factory);
	return {
		retrieval: new RetrievalToolOperationsController(factory, actor, toolPresentation),
		projects: new ProjectsToolOperationsController(factory, actor, toolPresentation),
		notes: new NotesToolOperationsController(
			factory,
			actor,
			reviews,
			toolPresentation,
			projectChoice,
			noteMarkdown,
			tokens
		),
		todos: new TodosToolOperationsController(factory, actor, toolPresentation),
		diagrams: new DiagramsToolOperationsController(factory, actor),
		suggestions: new SuggestionsToolOperationsController(factory, actor, toolPresentation),
		skills: new SkillsToolOperationsController(
			factory,
			actor,
			reviews,
			toolPresentation,
			projectChoice
		),
		account: new AccountToolOperationsController(factory, actor),
		memoryAndPreferences: new MemoryAndPreferencesToolOperationsController(
			factory,
			actor,
			provenanceId,
			toolPresentation
		),
		deliverables: new DeliverablesToolOperationsController(factory, actor),
		widgets: new WidgetsToolOperationsController(factory, actor, projectChoice)
	};
};
export const createSelectionToolOperations = (
	factory: AgentToolControllerProvider,
	actor: ActorContext,
	selection: TextSelection,
	model: string
): SelectionToolOperationsSet => {
	return {
		selection: new SelectionToolOperationsController(factory, actor, selection, model)
	};
};
export const createAppToolOperations = (
	factory: AgentToolControllerProvider,
	actor: ActorContext,
	context: AgentToolContext
): AppToolOperationsSet => {
	const projectChoice = new AgentProjectChoices(factory);
	return {
		app: new AppToolOperationsController(
			factory,
			actor,
			toolPresentation,
			noteMarkdown,
			context,
			projectChoice
		)
	};
};
export const createMcpToolOperations = (
	factory: AgentToolControllerProvider,
	actor: ActorContext,
	context: McpToolContext
): McpToolOperationsSet => {
	return {
		mcp: new McpToolOperationsController(factory, actor, toolPresentation, noteMarkdown, context)
	};
};
