import type {
	ActorContext,
	AgentEvent,
	AgentExecutionUpdate,
	NoteId,
	ProvenanceId,
	Skill,
	SkillSummary,
	TextSelection
} from '$lib/models';
import { NotFoundError } from '$lib/models';
import type {
	AgentRunner,
	AgentWorkflowToolbox,
	SkillFinder,
	SkillUsageRecorder,
	ToolDescriptor,
	ToolRetriever
} from '$lib/services';

export class InMemoryAgentRunner implements AgentRunner {
	events: AgentEvent[] = [];

	async *execute(
		_input: Parameters<AgentRunner['execute']>[0]
	): AsyncIterable<AgentExecutionUpdate> {
		void _input;
		for (const event of this.events) yield { type: 'event', event };
		yield { type: 'completed', sessionItems: [] };
	}
}

export class InMemoryToolRetriever implements ToolRetriever {
	names: string[] = [];

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
	skills: Skill[] = [];
	usages: { skillNoteId: NoteId; contextNoteId?: NoteId; provenanceId: ProvenanceId }[] = [];

	async listEnabled(_actor: ActorContext): Promise<readonly SkillSummary[]> {
		void _actor;
		return this.skills
			.filter((skill) => skill.isEnabled)
			.map((skill) => ({
				noteId: skill.note.id,
				name: skill.name,
				description: skill.description,
				triggerHints: skill.triggerHints,
				isEnabled: skill.isEnabled
			}));
	}
	async listAll(actor: ActorContext): Promise<readonly SkillSummary[]> {
		const enabled = await this.listEnabled(actor);
		const enabledIds = new Set(enabled.map((skill) => skill.noteId));
		return [
			...enabled,
			...this.skills
				.filter((skill) => !enabledIds.has(skill.note.id))
				.map((skill) => ({
					noteId: skill.note.id,
					name: skill.name,
					description: skill.description,
					triggerHints: skill.triggerHints,
					isEnabled: skill.isEnabled
				}))
		];
	}

	async load(_actor: ActorContext, noteId: NoteId): Promise<Skill> {
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
