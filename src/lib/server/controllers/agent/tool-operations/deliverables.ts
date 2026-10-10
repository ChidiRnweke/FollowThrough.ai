import { NotFoundError } from '$lib/errors';
import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { TemplateId } from '$lib/models/deliverables';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DeliverablesController } from '$lib/server/controllers/deliverables/controller';
import type { AgentToolOutput } from '../tool-outputs';
interface DeliverablesToolOperationsDependencies {
	deliverables(): Pick<
		DeliverablesController,
		| 'generateDocument'
		| 'listArtifacts'
		| 'listTemplates'
		| 'getExportSettings'
		| 'updateExportSettings'
		| 'getArtifact'
		| 'downloadArtifact'
		| 'deleteArtifact'
		| 'regenerateArtifact'
	>;
}
export interface DeliverablesToolOperations {
	export_document(
		input: AgentToolInput<'export_document'>
	): Promise<AgentToolOutput<'export_document'>>;
	list_artifacts(
		input: AgentToolInput<'list_artifacts'>
	): Promise<AgentToolOutput<'list_artifacts'>>;
	list_templates(
		input: AgentToolInput<'list_templates'>
	): Promise<AgentToolOutput<'list_templates'>>;
	get_export_settings(
		input: AgentToolInput<'get_export_settings'>
	): Promise<AgentToolOutput<'get_export_settings'>>;
	update_export_settings({
		projectId,
		...settings
	}: AgentToolInput<'update_export_settings'>): Promise<AgentToolOutput<'update_export_settings'>>;
	get_artifact(input: AgentToolInput<'get_artifact'>): Promise<AgentToolOutput<'get_artifact'>>;
	download_artifact(
		input: AgentToolInput<'download_artifact'>
	): Promise<AgentToolOutput<'download_artifact'>>;
	delete_artifact(
		input: AgentToolInput<'delete_artifact'>
	): Promise<AgentToolOutput<'delete_artifact'>>;
	regenerate_artifact(
		input: AgentToolInput<'regenerate_artifact'>
	): Promise<AgentToolOutput<'regenerate_artifact'>>;
}
export class DeliverablesToolOperationsController implements DeliverablesToolOperations {
	constructor(
		private readonly controllers: DeliverablesToolOperationsDependencies,
		private readonly actor: ActorContext
	) {}
	async export_document(
		input: AgentToolInput<'export_document'>
	): Promise<AgentToolOutput<'export_document'>> {
		return this.controllers.deliverables().generateDocument(this.actor, {
			projectId: input.projectId as ProjectId,
			noteIds: input.noteIds.map((noteId) => noteId as NoteId),
			title: input.title,
			format: input.format,
			...(input.templateId ? { templateId: input.templateId as TemplateId } : {})
		});
	}
	async list_artifacts(
		input: AgentToolInput<'list_artifacts'>
	): Promise<AgentToolOutput<'list_artifacts'>> {
		return this.controllers.deliverables().listArtifacts(this.actor, input.projectId);
	}
	async list_templates(
		input: AgentToolInput<'list_templates'>
	): Promise<AgentToolOutput<'list_templates'>> {
		return this.controllers.deliverables().listTemplates(this.actor, input.projectId);
	}
	async get_export_settings(
		input: AgentToolInput<'get_export_settings'>
	): Promise<AgentToolOutput<'get_export_settings'>> {
		return this.controllers.deliverables().getExportSettings(this.actor, input.projectId);
	}
	async update_export_settings({
		projectId,
		...settings
	}: AgentToolInput<'update_export_settings'>): Promise<AgentToolOutput<'update_export_settings'>> {
		return this.controllers.deliverables().updateExportSettings(this.actor, projectId, settings);
	}
	async get_artifact(
		input: AgentToolInput<'get_artifact'>
	): Promise<AgentToolOutput<'get_artifact'>> {
		const artifact = await this.controllers
			.deliverables()
			.getArtifact(this.actor, input.artifactId);
		if (!artifact) throw new NotFoundError('Artifact not found');
		return artifact;
	}
	async download_artifact(
		input: AgentToolInput<'download_artifact'>
	): Promise<AgentToolOutput<'download_artifact'>> {
		return this.controllers.deliverables().downloadArtifact(this.actor, input.artifactId);
	}
	async delete_artifact(
		input: AgentToolInput<'delete_artifact'>
	): Promise<AgentToolOutput<'delete_artifact'>> {
		const deleted = await this.controllers
			.deliverables()
			.deleteArtifact(this.actor, input.artifactId);
		return { artifactId: deleted.id, title: deleted.title, deleted: true as const };
	}
	async regenerate_artifact(
		input: AgentToolInput<'regenerate_artifact'>
	): Promise<AgentToolOutput<'regenerate_artifact'>> {
		return this.controllers.deliverables().regenerateArtifact(this.actor, input.artifactId);
	}
}
