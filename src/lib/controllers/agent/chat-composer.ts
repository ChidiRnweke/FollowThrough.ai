import { MAX_CONCURRENT_STREAMS } from '$lib/models/chat';
import type { ConversationImageInput, RunAgentInput } from '$lib/models/agent';
import type { NoteId, NoteSummary } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type {
	ContextChip,
	ResourceChip,
	SelectionChip,
	MentionHistory,
	MentionInput,
	MentionEdit
} from '$lib/models/chat';
import type { ChatHandoff } from '$lib/models/chat';
import type { ChatSessionController } from './chat-session';
import type { AgentContextController } from './context';
import type { AgentSelectionContextController } from './selection-context';
import type { ChatChipRules } from '$lib/services/chat/chips';
import type { ChatComposerState } from '$lib/stores/agent/chat-composer.svelte';
export interface ChatDraftStorage {
	read(): string;
	save(text: string): void;
	consumeHandoff(): ChatHandoff | undefined;
}
export interface ChatSubmissionEnvironment {
	atStreamLimit(): boolean;
	takeCanvasRender(sessionKey: string): ConversationImageInput | undefined;
}
export interface ComposerRequestContext {
	readonly text: string;
	readonly images: readonly ConversationImageInput[];
	readonly noteTree: readonly NoteSummary[];
	readonly availability: 'unknown' | 'complete';
	readonly autoChip: ResourceChip | undefined;
	readonly focusedNoteId: NoteId | undefined;
	readonly activeProjectId: ProjectId | undefined;
	readonly liveSelectionChip: SelectionChip | undefined;
}
export type ComposerRequest =
	| { readonly kind: 'ready'; readonly request: Omit<RunAgentInput, 'conversationId'> }
	| { readonly kind: 'unavailable'; readonly message: string };
export interface ChatComposerController {
	restore(noteTree: readonly NoteSummary[]): {
		readonly text: string;
		readonly source: 'handoff' | 'draft';
	};
	consumeStaged(noteTree: readonly NoteSummary[]): string | undefined;
	prefill(request: ChatHandoff, noteTree: readonly NoteSummary[]): string;
	replace(text: string): string;
	save(text: string): void;
	pick(text: string, chip: ResourceChip): string;
	unpick(chip: ContextChip): string;
	edit(
		text: string,
		change: MentionInput | { readonly kind: 'undo' | 'redo' }
	): { readonly text: string; readonly mentionsCleared: boolean };
	editMention(edit: MentionEdit): string;
	key(chip: Pick<ContextChip, 'kind' | 'id'>): string;
	request(context: ComposerRequestContext): ComposerRequest;
	send(
		context: ComposerRequestContext
	):
		| { readonly kind: 'started'; readonly completion: Promise<void> }
		| { readonly kind: 'unavailable'; readonly message: string };
}
export class ChatComposer implements ChatComposerController {
	constructor(
		private readonly state: ChatComposerState,
		private readonly chat: ChatSessionController,
		private readonly context: AgentContextController,
		private readonly selection: AgentSelectionContextController,
		private readonly chips: ChatChipRules,
		private readonly storage: ChatDraftStorage,
		private readonly environment: ChatSubmissionEnvironment
	) {}
	key(chip: Pick<ContextChip, 'kind' | 'id'>): string {
		return this.chips.key(chip);
	}
	restore(noteTree: readonly NoteSummary[]): {
		readonly text: string;
		readonly source: 'handoff' | 'draft';
	} {
		const staged = this.storage.consumeHandoff();
		return staged
			? { text: this.prefill(staged, noteTree), source: 'handoff' }
			: { text: this.replace(this.storage.read()), source: 'draft' };
	}
	consumeStaged(noteTree: readonly NoteSummary[]): string | undefined {
		const staged = this.chat.consumeStaged();
		return staged ? this.prefill(staged, noteTree) : undefined;
	}
	prefill(request: ChatHandoff, noteTree: readonly NoteSummary[]): string {
		const text = this.replace(request.prompt);
		this.state.handoff = request;
		if (request.selection) {
			const title = noteTree.find((note) => note.id === request.selection?.noteId)?.title;
			this.chat.addChip(this.selection.pin(request.selection, title ?? 'Untitled note'));
		}
		this.save(text);
		return text;
	}
	replace(text: string): string {
		if (this.chat.mentionDraft.present.text !== text) {
			this.chat.setMentionDraft(this.context.start(text));
			this.chat.setChips(this.chat.chips.filter((chip) => chip.kind === 'selection'));
		}
		return text;
	}
	save(text: string): void {
		this.storage.save(text);
	}
	pick(text: string, chip: ResourceChip): string {
		this.replace(text);
		this.chat.setMentionDraft(this.context.add(this.chat.mentionDraft, chip));
		this.chat.addChip(chip);
		this.save(this.chat.mentionDraft.present.text);
		return this.chat.mentionDraft.present.text;
	}
	unpick(chip: ContextChip): string {
		if (chip.kind !== 'selection')
			this.chat.setMentionDraft(this.context.remove(this.chat.mentionDraft, chip));
		this.chat.removeChip(chip);
		const text = this.chat.mentionDraft.present.text;
		this.save(text);
		return text;
	}
	editMention(edit: MentionEdit): string {
		this.chat.setMentionDraft(this.context.edit(this.chat.mentionDraft, edit));
		const text = this.chat.mentionDraft.present.text;
		this.save(text);
		return text;
	}
	edit(
		text: string,
		change: MentionInput | { readonly kind: 'undo' | 'redo' }
	): { text: string; mentionsCleared: boolean } {
		let next: MentionHistory | undefined;
		if (change.kind === 'undo' || change.kind === 'redo') {
			const restored = this.context.restore(this.chat.mentionDraft, text, change.kind);
			if (restored.kind === 'restored') next = restored.history;
		} else if (change.kind === 'edit')
			next = this.context.edit(this.chat.mentionDraft, change.edit);
		else if (text === this.chat.mentionDraft.present.text) next = this.chat.mentionDraft;
		const mentionsCleared = !next && this.chat.mentionDraft.present.references.length > 0;
		this.chat.setMentionDraft(next ?? this.context.start(text));
		const mentioned = new Map(
			this.chat.mentionDraft.present.references.map(({ chip }) => [this.chips.key(chip), chip])
		);
		this.chat.setChips([
			...this.chat.chips.filter((chip) => chip.kind === 'selection'),
			...mentioned.values()
		]);
		this.save(text);
		return { text, mentionsCleared };
	}
	request(input: ComposerRequestContext): ComposerRequest {
		const folderIds = this.chat.chips.flatMap((chip) => (chip.kind === 'folder' ? [chip.id] : []));
		const folders = this.context.folders(input.noteTree, folderIds, input.availability);
		if (folders.kind === 'incomplete')
			return {
				kind: 'unavailable',
				message: 'The workspace is still loading. Wait before sending a folder as context.'
			};
		if (folders.kind === 'missing')
			return {
				kind: 'unavailable',
				message: 'An attached folder is no longer available. Remove it or choose another folder.'
			};
		const noteIds = [
			...new Set([
				...(input.autoChip?.kind === 'note' ? [input.autoChip.id] : []),
				...folders.noteIds
			])
		];
		const refs = input.autoChip ? this.chips.resources(input.autoChip) : [];
		const handoff = this.state.handoff;
		const noteId = handoff?.noteId ?? input.focusedNoteId;
		const projectId =
			handoff?.projectId ??
			(input.focusedNoteId
				? input.noteTree.find((note) => note.id === input.focusedNoteId)?.projectId
				: input.activeProjectId);
		return {
			kind: 'ready',
			request: {
				prompt: input.text,
				...(input.images.length ? { images: input.images } : {}),
				modelOverride: this.chat.modelOverride,
				executionModeOverride: this.chat.executionModeOverride,
				...(noteId !== undefined ? { noteId } : {}),
				...(projectId !== undefined ? { projectId } : {}),
				...(noteIds.length ? { contextNoteIds: noteIds } : {}),
				...(refs.length ? { contextResources: refs } : {}),
				...(input.liveSelectionChip ? { selections: [input.liveSelectionChip.selection] } : {}),
				...(handoff?.requestedSkillNames
					? { requestedSkillNames: [...handoff.requestedSkillNames] }
					: {})
			}
		};
	}
	send(
		input: ComposerRequestContext
	): { kind: 'started'; completion: Promise<void> } | { kind: 'unavailable'; message: string } {
		if (!this.chat.canExecute || this.chat.isStreaming)
			return { kind: 'unavailable', message: 'Reconnect before sending another message.' };
		const prepared = this.request(input);
		if (prepared.kind === 'unavailable') return prepared;
		if (this.environment.atStreamLimit())
			return {
				kind: 'unavailable',
				message: `Only ${MAX_CONCURRENT_STREAMS} chats can run at once. Wait for one to finish.`
			};
		const render = this.environment.takeCanvasRender(this.chat.sessionKey);
		const completion = this.chat.send({
			...prepared.request,
			...(render ? { contextImages: [render] } : {})
		});
		this.chat.setChips([]);
		this.chat.setMentionDraft(this.context.start(''));
		this.state.handoff = undefined;
		this.storage.save('');
		return { kind: 'started', completion };
	}
}
