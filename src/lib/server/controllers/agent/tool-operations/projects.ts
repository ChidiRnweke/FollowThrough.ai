import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { ActorContext } from '$lib/models/identity';
import type { ProjectsController } from '$lib/server/controllers/projects/controller';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { AgentToolOutput } from '../tool-outputs';
interface ProjectsToolOperationsDependencies {
	projects(): Pick<
		ProjectsController,
		'list' | 'get' | 'create' | 'rename' | 'archive' | 'createFolder' | 'move'
	>;
}
export interface ProjectsToolOperations {
	list_projects(): Promise<AgentToolOutput<'list_projects'>>;
	get_project(input: AgentToolInput<'get_project'>): Promise<AgentToolOutput<'get_project'>>;
	create_project(
		input: AgentToolInput<'create_project'>
	): Promise<AgentToolOutput<'create_project'>>;
	rename_project(
		input: AgentToolInput<'rename_project'>
	): Promise<AgentToolOutput<'rename_project'>>;
	archive_project(
		input: AgentToolInput<'archive_project'>
	): Promise<AgentToolOutput<'archive_project'>>;
	create_folder(input: AgentToolInput<'create_folder'>): Promise<AgentToolOutput<'create_folder'>>;
	move_project_entry(
		input: AgentToolInput<'move_project_entry'>
	): Promise<AgentToolOutput<'move_project_entry'>>;
}
export class ProjectsToolOperationsController implements ProjectsToolOperations {
	constructor(
		private readonly controllers: ProjectsToolOperationsDependencies,
		private readonly actor: ActorContext,
		private readonly toolPresentation: AgentToolPresentation
	) {}
	async list_projects(): Promise<AgentToolOutput<'list_projects'>> {
		return {
			projects: (await this.controllers.projects().list(this.actor)).projects.map((value) =>
				this.toolPresentation.projectProject(value)
			)
		};
	}
	async get_project(input: AgentToolInput<'get_project'>): Promise<AgentToolOutput<'get_project'>> {
		return this.controllers.projects().get(this.actor, input);
	}
	async create_project(
		input: AgentToolInput<'create_project'>
	): Promise<AgentToolOutput<'create_project'>> {
		return this.toolPresentation.projectProject(
			(await this.controllers.projects().create(this.actor, input)).project
		);
	}
	async rename_project(
		input: AgentToolInput<'rename_project'>
	): Promise<AgentToolOutput<'rename_project'>> {
		return this.toolPresentation.projectProject(
			(await this.controllers.projects().rename(this.actor, input)).project
		);
	}
	async archive_project(
		input: AgentToolInput<'archive_project'>
	): Promise<AgentToolOutput<'archive_project'>> {
		return this.toolPresentation.projectProject(
			(await this.controllers.projects().archive(this.actor, input)).project
		);
	}
	async create_folder(
		input: AgentToolInput<'create_folder'>
	): Promise<AgentToolOutput<'create_folder'>> {
		return this.toolPresentation.projectNoteWrite(
			(await this.controllers.projects().createFolder(this.actor, input)).folder
		);
	}
	async move_project_entry(
		input: AgentToolInput<'move_project_entry'>
	): Promise<AgentToolOutput<'move_project_entry'>> {
		return this.controllers.projects().move(this.actor, input);
	}
}
