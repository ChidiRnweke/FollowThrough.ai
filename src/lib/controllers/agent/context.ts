import type { ContextResourceRef } from '$lib/models/agent';
import type { ContextChip } from '$lib/models/chat';
import type { ContextChips } from '$lib/services/chat/chips';
import type { ChatMentions } from '$lib/services/chat/mentions';
import {
	createMentionHistory,
	type MentionHistory,
	type MentionEdit,
	type MentionRestore
} from '$lib/models/chat';
import type { FolderContextResolution, NoteId, NoteSummary } from '$lib/models/notes';
import type { SkillSummary } from '$lib/models/skills';
import type { ResourceChip, MentionableResources } from '$lib/models/chat';
import type { Diagram } from '$lib/models/diagrams';
import type { AgentContextSelection } from '$lib/services/agent/context-selection';
export interface AgentContextController {
	chipKeyOf(chip: Pick<ContextChip, 'kind' | 'id'>): string;
	contextResourceRefOf(chip: ContextChip): readonly ContextResourceRef[];
	uniqueContextResources(refs: readonly ContextResourceRef[]): readonly ContextResourceRef[];
	start(text: string): MentionHistory;
	edit(history: MentionHistory, edit: MentionEdit): MentionHistory;
	add(history: MentionHistory, chip: ResourceChip): MentionHistory;
	remove(history: MentionHistory, chip: ResourceChip): MentionHistory;
	restore(history: MentionHistory, text: string, direction: 'undo' | 'redo'): MentionRestore;

	folderNotes(noteTree: readonly NoteSummary[], folderId: NoteId): NoteId[];
	folders(
		noteTree: readonly NoteSummary[],
		folderIds: readonly NoteId[],
		availability: 'unknown' | 'complete'
	): FolderContextResolution;
	query(prompt: string): string | undefined;
	diagramName(diagram: Pick<Diagram, 'title'>): string;
	candidates(
		query: string,
		noteTree: readonly NoteSummary[],
		skills: readonly SkillSummary[],
		availability: 'unknown' | 'complete',
		resources: MentionableResources
	): ResourceChip[];
}
export class AgentContext implements AgentContextController {
	readonly chipKeyOf = (chip: Pick<ContextChip, 'kind' | 'id'>): string =>
		this.chips.chipKeyOf(chip);
	readonly contextResourceRefOf = (chip: ContextChip): readonly ContextResourceRef[] =>
		this.chips.contextResourceRefOf(chip);
	readonly uniqueContextResources = (
		refs: readonly ContextResourceRef[]
	): readonly ContextResourceRef[] => this.chips.uniqueContextResources(refs);
	constructor(
		private readonly chips: ContextChips,
		private readonly selection: AgentContextSelection,
		private readonly mentions: ChatMentions
	) {}
	start(text: string): MentionHistory {
		return createMentionHistory(text);
	}
	edit(history: MentionHistory, edit: MentionEdit): MentionHistory {
		return this.mentions.edit(history, edit);
	}
	add(history: MentionHistory, chip: ResourceChip): MentionHistory {
		return this.mentions.add(history, chip);
	}
	remove(history: MentionHistory, chip: ResourceChip): MentionHistory {
		return this.mentions.remove(history, chip);
	}
	restore(history: MentionHistory, text: string, direction: 'undo' | 'redo'): MentionRestore {
		return this.mentions.restore(history, text, direction);
	}

	folderNotes(noteTree: readonly NoteSummary[], folderId: NoteId): NoteId[] {
		return this.selection.folderNotes(noteTree, folderId);
	}
	folders(
		noteTree: readonly NoteSummary[],
		folderIds: readonly NoteId[],
		availability: 'unknown' | 'complete'
	): FolderContextResolution {
		return this.selection.folders(noteTree, folderIds, availability);
	}
	query(prompt: string): string | undefined {
		return this.selection.query(prompt);
	}
	diagramName(diagram: Pick<Diagram, 'title'>): string {
		return this.selection.diagramName(diagram);
	}
	candidates(
		query: string,
		noteTree: readonly NoteSummary[],
		skills: readonly SkillSummary[],
		availability: 'unknown' | 'complete',
		resources: MentionableResources
	): ResourceChip[] {
		return this.selection.candidates(query, noteTree, skills, availability, resources);
	}
}
