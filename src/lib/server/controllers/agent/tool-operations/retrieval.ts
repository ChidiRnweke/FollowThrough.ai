import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { AgentFilesController } from '$lib/server/controllers/agent-files/controller';
import type { RetrievalController } from '$lib/server/controllers/knowledge-search/controller';
import type { WorkspaceController } from '$lib/server/controllers/workspace/controller';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { AgentToolOutput } from '../tool-outputs';
interface RetrievalToolOperationsDependencies {
	agentFiles(): Pick<AgentFilesController, 'ls' | 'grep' | 'sed'>;
	retrieval(): Pick<RetrievalController, 'search'>;
	workspace(): Pick<WorkspaceController, 'getShellContext' | 'getTodayView'>;
}
export interface RetrievalToolOperations {
	ls(input: AgentToolInput<'ls'>): ReturnType<AgentFilesController['ls']>;
	grep(input: AgentToolInput<'grep'>): ReturnType<AgentFilesController['grep']>;
	sed(input: AgentToolInput<'sed'>): ReturnType<AgentFilesController['sed']>;
	search(input: AgentToolInput<'search'>): Promise<AgentToolOutput<'search'>>;
	search_note(input: AgentToolInput<'search_note'>): Promise<AgentToolOutput<'search_note'>>;
	get_workspace_context(): Promise<AgentToolOutput<'get_workspace_context'>>;
	get_today_view(
		input: AgentToolInput<'get_today_view'>
	): Promise<AgentToolOutput<'get_today_view'>>;
}
export class RetrievalToolOperationsController implements RetrievalToolOperations {
	constructor(
		private readonly controllers: RetrievalToolOperationsDependencies,
		private readonly actor: ActorContext,
		private readonly toolPresentation: AgentToolPresentation
	) {}
	async ls(input: AgentToolInput<'ls'>): ReturnType<AgentFilesController['ls']> {
		return await this.controllers.agentFiles().ls(this.actor, input.path);
	}
	async grep(input: AgentToolInput<'grep'>): ReturnType<AgentFilesController['grep']> {
		return await this.controllers.agentFiles().grep(this.actor, {
			pattern: input.pattern,
			path: input.path,
			fixed: input.fixed ?? false,
			ignoreCase: input.ignoreCase ?? false
		});
	}
	async sed(input: AgentToolInput<'sed'>): ReturnType<AgentFilesController['sed']> {
		return await this.controllers.agentFiles().sed(this.actor, input.path, input.range);
	}
	async search(input: AgentToolInput<'search'>): Promise<AgentToolOutput<'search'>> {
		return this.controllers.retrieval().search(this.actor, {
			query: input.query,
			...(input.projectId ? { projectId: input.projectId as ProjectId } : {}),
			...(input.createdAfter ? { createdAfter: input.createdAfter } : {}),
			...(input.createdBefore ? { createdBefore: input.createdBefore } : {})
		});
	}
	async search_note(input: AgentToolInput<'search_note'>): Promise<AgentToolOutput<'search_note'>> {
		return this.controllers.retrieval().search(this.actor, {
			query: input.query,
			noteId: input.noteId as NoteId,
			...(input.createdAfter ? { createdAfter: input.createdAfter } : {}),
			...(input.createdBefore ? { createdBefore: input.createdBefore } : {})
		});
	}
	async get_workspace_context(): Promise<AgentToolOutput<'get_workspace_context'>> {
		const shell = await this.controllers.workspace().getShellContext(this.actor);
		return {
			user: this.toolPresentation.projectUser(shell.user),
			projects: shell.projects.map((value) => this.toolPresentation.projectProject(value)),
			// Structure only — the agent calls get_note for content.
			noteTree: shell.noteTree.map((value) => this.toolPresentation.projectNoteSummary(value)),
			skills: shell.skills,
			pendingSuggestionCount: shell.pendingSuggestionCount
		};
	}
	async get_today_view(
		input: AgentToolInput<'get_today_view'>
	): Promise<AgentToolOutput<'get_today_view'>> {
		return this.controllers.workspace().getTodayView(this.actor, input);
	}
}
