import { NotFoundError } from '$lib/errors';
import type { ToolDescriptor } from '$lib/models/agent/tool-index';
import type { ActorContext } from '$lib/models/identity';
import type { Note, NoteId, TextSelection } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { ProvenanceId } from '$lib/models/provenance';
import type { Skill, SkillSummary } from '$lib/models/skills';
import type { ToolRetriever } from '$lib/server/controllers/tool-discovery/controller';
import type { ToolRanking } from '$lib/server/services/agent/tools/tool-search';
import type { AgentWorkflowToolbox } from '$lib/server/services/agent/runs/contracts';
import type { SkillFinder, SkillUsageRecorder } from '$lib/server/services/skills/library';

export class InMemoryToolRetriever implements ToolRetriever, ToolRanking {
	names: string[] = [];

	async rank(_names: readonly string[], _query: string, _limit: number): Promise<string[]> {
		return this.names;
	}

	async retrieve(
		_catalog: readonly ToolDescriptor[],
		_query: string,
		_topN: number
	): Promise<string[]> {
		void _catalog;
		void _query;
		void _topN;
		return this.names;
	}
}

export class InMemoryAgentToolbox implements AgentWorkflowToolbox {
	async extractPromises(_actor: ActorContext, _selection: TextSelection): Promise<never> {
		void _actor;
		void _selection;
		throw new Error('Unexpected extractPromises tool invocation');
	}
	async relate(_actor: ActorContext, _selection: TextSelection): Promise<never> {
		void _actor;
		void _selection;
		throw new Error('Unexpected relate tool invocation');
	}
	async reference(_actor: ActorContext, _selection: TextSelection): Promise<never> {
		void _actor;
		void _selection;
		throw new Error('Unexpected reference tool invocation');
	}
	async generateDiagram(
		_actor: ActorContext,
		_selection: TextSelection,
		_instruction?: string
	): Promise<never> {
		void _actor;
		void _selection;
		void _instruction;
		throw new Error('Unexpected generateDiagram tool invocation');
	}
}

export class InMemorySkills implements SkillFinder, SkillUsageRecorder {
	skills: Skill<Note>[] = [];
	pins: { projectId: ProjectId; skillNoteId: NoteId }[] = [];
	usages: { skillNoteId: NoteId; contextNoteId?: NoteId; provenanceId: ProvenanceId }[] = [];

	private summarize(skill: Skill<Note>, projectId: ProjectId | undefined): SkillSummary {
		return {
			noteId: skill.note.id,
			projectId: skill.note.projectId,
			name: skill.note.title,
			slug: skill.slug,
			description: skill.description,
			triggerHints: skill.triggerHints,
			allowImplicitInvocation: skill.allowImplicitInvocation,
			isEnabled: skill.isEnabled,
			isPinned: this.pins.some(
				(pin) => pin.projectId === projectId && pin.skillNoteId === skill.note.id
			)
		};
	}

	async listEnabled(_actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		void _actor;
		return this.skills
			.filter((skill) => skill.isEnabled)
			.map((skill) => this.summarize(skill, projectId));
	}
	async listAll(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		const enabled = await this.listEnabled(actor, projectId);
		const enabledIds = new Set(enabled.map((skill) => skill.noteId));
		return [
			...enabled,
			...this.skills
				.filter((skill) => !enabledIds.has(skill.note.id))
				.map((skill) => this.summarize(skill, projectId))
		];
	}

	async load(_actor: ActorContext, noteId: NoteId): Promise<Skill<Note>> {
		void _actor;
		const skill = this.skills.find((candidate) => candidate.note.id === noteId);
		if (!skill) throw new NotFoundError('Skill was not found');
		return skill;
	}

	async record(
		_actor: ActorContext,
		input: { skillNoteId: NoteId; contextNoteId?: NoteId; provenanceId: ProvenanceId }
	): Promise<void> {
		void _actor;
		this.usages.push(input);
	}
}
