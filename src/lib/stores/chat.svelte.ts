import type {
	AgentEvent,
	ConversationId,
	NoteId,
	RunAgentInput,
	SuggestionView
} from '$lib/models';
import { suggestionToView } from './suggestion-view';

export interface ContextChip {
	readonly kind: 'note' | 'skill';
	readonly id: NoteId;
	readonly name: string;
}

export interface ChatToolActivity {
	readonly name: string;
	status: 'running' | 'succeeded';
}

export interface ChatEntry {
	readonly id: string;
	readonly role: 'user' | 'assistant';
	text: string;
	tools: ChatToolActivity[];
	suggestions: SuggestionView[];
}

class ChatStore {
	entries = $state<ChatEntry[]>([]);
	isStreaming = $state(false);
	conversationId = $state<ConversationId | undefined>(undefined);
	chips = $state<ContextChip[]>([]);
	// The auto chip for the open note reappears when a different note opens.
	autoChipDismissedFor = $state<NoteId | undefined>(undefined);

	addChip(chip: ContextChip): void {
		if (!this.chips.some((known) => known.kind === chip.kind && known.id === chip.id)) {
			this.chips = [...this.chips, chip];
		}
	}

	removeChip(chip: ContextChip): void {
		this.chips = this.chips.filter((known) => known.kind !== chip.kind || known.id !== chip.id);
	}

	async send(input: Omit<RunAgentInput, 'conversationId'>): Promise<void> {
		if (this.isStreaming) return;
		const noteChips = this.chips.filter((chip) => chip.kind === 'note').map((chip) => chip.id);
		const skillChips = this.chips.filter((chip) => chip.kind === 'skill').map((chip) => chip.name);
		input = {
			...input,
			contextNoteIds: [...new Set([...(input.contextNoteIds ?? []), ...noteChips])],
			requestedSkillNames: [...new Set([...(input.requestedSkillNames ?? []), ...skillChips])]
		};
		this.entries.push({
			id: crypto.randomUUID(),
			role: 'user',
			text: input.prompt,
			tools: [],
			suggestions: []
		});
		this.entries.push({
			id: crypto.randomUUID(),
			role: 'assistant',
			text: '',
			tools: [],
			suggestions: []
		});
		// re-read through the $state proxy so streamed mutations stay reactive
		const reply = this.entries[this.entries.length - 1]!;
		this.isStreaming = true;
		try {
			const response = await fetch('/api/agent', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...input, conversationId: this.conversationId })
			});
			if (!response.ok || !response.body) {
				reply.text = 'The agent is unavailable. Try again.';
				return;
			}
			for await (const event of readNdjson(response.body)) {
				this.apply(reply, event);
			}
		} catch {
			reply.text = reply.text || 'The agent run failed. Try again.';
		} finally {
			this.isStreaming = false;
		}
	}

	private apply(reply: ChatEntry, event: AgentEvent): void {
		if (event.type === 'text_delta') reply.text += event.text;
		else if (event.type === 'tool_started')
			reply.tools.push({ name: event.name, status: 'running' });
		else if (event.type === 'tool_completed') {
			const tool = reply.tools.find(
				(item) => item.name === event.name && item.status === 'running'
			);
			if (tool) tool.status = 'succeeded';
		} else if (event.type === 'suggestion')
			reply.suggestions.push(suggestionToView(event.suggestion, 'agent'));
		else if (event.type === 'completed') this.conversationId = event.conversationId;
	}

	clear(): void {
		this.entries = [];
		this.conversationId = undefined;
	}
}

async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<AgentEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			if (line.trim()) yield JSON.parse(line) as AgentEvent;
		}
	}
	if (buffer.trim()) yield JSON.parse(buffer) as AgentEvent;
}

export const chat = new ChatStore();
