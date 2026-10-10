import { type AccountToolOperations } from '$lib/server/controllers/agent/tool-operations/account';
import { type AppToolOperations } from '$lib/server/controllers/agent/tool-operations/app';
import { type DeliverablesToolOperations } from '$lib/server/controllers/agent/tool-operations/deliverables';
import { type DiagramsToolOperations } from '$lib/server/controllers/agent/tool-operations/diagrams';
import { type McpToolOperations } from '$lib/server/controllers/agent/tool-operations/mcp';
import { type MemoryAndPreferencesToolOperations } from '$lib/server/controllers/agent/tool-operations/memory-and-preferences';
import { type NotesToolOperations } from '$lib/server/controllers/agent/tool-operations/notes';
import { type ProjectsToolOperations } from '$lib/server/controllers/agent/tool-operations/projects';
import { type RetrievalToolOperations } from '$lib/server/controllers/agent/tool-operations/retrieval';
import { type SelectionToolOperations } from '$lib/server/controllers/agent/tool-operations/selection';
import { type SkillsToolOperations } from '$lib/server/controllers/agent/tool-operations/skills';
import { type SuggestionsToolOperations } from '$lib/server/controllers/agent/tool-operations/suggestions';
import { type TodosToolOperations } from '$lib/server/controllers/agent/tool-operations/todos';
import { type WidgetsToolOperations } from '$lib/server/controllers/agent/tool-operations/widgets';
export interface SharedToolOperations {
	readonly retrieval: RetrievalToolOperations;
	readonly projects: ProjectsToolOperations;
	readonly notes: NotesToolOperations;
	readonly todos: TodosToolOperations;
	readonly diagrams: DiagramsToolOperations;
	readonly suggestions: SuggestionsToolOperations;
	readonly skills: SkillsToolOperations;
	readonly account: AccountToolOperations;
	readonly memoryAndPreferences: MemoryAndPreferencesToolOperations;
	readonly deliverables: DeliverablesToolOperations;
	readonly widgets: WidgetsToolOperations;
}
export interface SelectionToolOperationsSet {
	readonly selection: SelectionToolOperations;
}
export interface AppToolOperationsSet {
	readonly app: AppToolOperations;
}
export interface McpToolOperationsSet {
	readonly mcp: McpToolOperations;
}
