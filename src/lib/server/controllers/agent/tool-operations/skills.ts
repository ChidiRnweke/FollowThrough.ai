import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { AgentToolReviewControl } from '$lib/server/controllers/agent/tool-reviews';
import type { SkillsController } from '$lib/server/controllers/skills/controller';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { AgentProjectChoice } from '../project-choice';
import type { AgentToolOutput } from '../tool-outputs';
interface SkillsToolOperationsDependencies {
	skills(): Pick<
		SkillsController,
		'list' | 'create' | 'listVersions' | 'restoreVersion' | 'update' | 'setPinned'
	>;
}
export interface SkillsToolOperations {
	list_skills(): Promise<AgentToolOutput<'list_skills'>>;
	save_skill(input: AgentToolInput<'save_skill'>): Promise<AgentToolOutput<'save_skill'>>;
	edit_skill(input: AgentToolInput<'edit_skill'>): Promise<AgentToolOutput<'edit_skill'>>;
	create_skill(input: AgentToolInput<'create_skill'>): Promise<AgentToolOutput<'create_skill'>>;
	list_skill_versions(
		input: AgentToolInput<'list_skill_versions'>
	): Promise<AgentToolOutput<'list_skill_versions'>>;
	restore_skill_version(
		input: AgentToolInput<'restore_skill_version'>
	): Promise<AgentToolOutput<'restore_skill_version'>>;
	update_skill(input: AgentToolInput<'update_skill'>): Promise<AgentToolOutput<'update_skill'>>;
	set_skill_pinned(
		input: AgentToolInput<'set_skill_pinned'>
	): Promise<AgentToolOutput<'set_skill_pinned'>>;
}
export class SkillsToolOperationsController implements SkillsToolOperations {
	constructor(
		private readonly controllers: SkillsToolOperationsDependencies,
		private readonly actor: ActorContext,
		private readonly reviews: Pick<AgentToolReviewControl, 'change'>,
		private readonly toolPresentation: AgentToolPresentation,
		private readonly projectChoice: AgentProjectChoice
	) {}
	async list_skills(): Promise<AgentToolOutput<'list_skills'>> {
		return this.controllers.skills().list(this.actor);
	}
	async save_skill(input: AgentToolInput<'save_skill'>): Promise<AgentToolOutput<'save_skill'>> {
		return this.reviews.change(
			{
				kind: 'replace',
				noteId: input.noteId as NoteId,
				markdown: input.markdown
			},
			'skill'
		);
	}
	async edit_skill(input: AgentToolInput<'edit_skill'>): Promise<AgentToolOutput<'edit_skill'>> {
		return this.reviews.change(
			{
				kind: 'patch',
				noteId: input.noteId as NoteId,
				edits: input.edits
			},
			'skill'
		);
	}
	async create_skill(
		input: AgentToolInput<'create_skill'>
	): Promise<AgentToolOutput<'create_skill'>> {
		const chosenProjectId =
			input.projectId ?? (await this.projectChoice.requireChoice(this.actor, 'create a skill'));
		return this.controllers.skills().create(this.actor, { ...input, projectId: chosenProjectId });
	}
	async list_skill_versions(
		input: AgentToolInput<'list_skill_versions'>
	): Promise<AgentToolOutput<'list_skill_versions'>> {
		const revisions = await this.controllers.skills().listVersions(this.actor, input);
		return {
			revisions: revisions.map((value) => this.toolPresentation.projectNoteRevision(value))
		};
	}
	async restore_skill_version(
		input: AgentToolInput<'restore_skill_version'>
	): Promise<AgentToolOutput<'restore_skill_version'>> {
		return this.controllers.skills().restoreVersion(this.actor, input);
	}
	async update_skill(
		input: AgentToolInput<'update_skill'>
	): Promise<AgentToolOutput<'update_skill'>> {
		return this.controllers.skills().update(this.actor, input);
	}
	async set_skill_pinned(
		input: AgentToolInput<'set_skill_pinned'>
	): Promise<AgentToolOutput<'set_skill_pinned'>> {
		await this.controllers.skills().setPinned(this.actor, input);
		return input;
	}
}
