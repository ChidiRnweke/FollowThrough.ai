import type {
	AgentEvent,
	AgentExecutionMode,
	ConversationId,
	NoteId,
	RunAgentInput,
	SuggestionView
} from '$lib/models';
import { suggestionToView } from './suggestion-view';

const STORAGE_KEY = 'followthrough.agent.conversation';
const browser = typeof window !== 'undefined';

interface PersistedConversationChoices {
	conversationId?: ConversationId;
	modelOverride?: string | null;
	executionModeOverride?: AgentExecutionMode;
}

const persistedConversation = (): PersistedConversationChoices => {
	if (!browser) return {};
	try {
		return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as PersistedConversationChoices;
	} catch {
		return {};
	}
};

const persisted = persistedConversation();

export interface ContextChip {
	readonly kind: 'note' | 'skill';
	readonly id: NoteId;
	readonly name: string;
}

export interface ChatToolActivity {
	readonly callId: string;
	readonly name: string;
	readonly arguments: Readonly<Record<string, unknown>>;
	runId?: string;
	output?: unknown;
	failure?: string;
	status: 'running' | 'approval_required' | 'succeeded' | 'failed' | 'rejected';
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
	conversationId = $state<ConversationId | undefined>(persisted.conversationId);
	modelOverride = $state<string | null>(persisted.modelOverride ?? null);
	executionModeOverride = $state<AgentExecutionMode>(
		persisted.executionModeOverride ?? 'approval_required'
	);
	chips = $state<ContextChip[]>([]);
	// The auto chip for the open note reappears when a different note opens.
	autoChipDismissedFor = $state<NoteId | undefined>(undefined);
	private defaultsConfigured = false;

	configureDefaults(mode: AgentExecutionMode): void {
		if (this.defaultsConfigured || this.entries.length > 0 || this.conversationId) return;
		this.executionModeOverride = mode;
		this.defaultsConfigured = true;
	}

	persistConversationChoices(): void {
		if (!browser) return;
		sessionStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				conversationId: this.conversationId,
				modelOverride: this.modelOverride,
				executionModeOverride: this.executionModeOverride
			})
		);
	}

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
			modelOverride: this.modelOverride,
			executionModeOverride: this.executionModeOverride,
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

	async decide(
		reply: ChatEntry,
		tool: ChatToolActivity,
		decision: 'approve' | 'reject'
	): Promise<void> {
		if (this.isStreaming || !tool.runId) return;
		this.isStreaming = true;
		try {
			const response = await fetch(`/api/agent/runs/${tool.runId}/decision`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ callId: tool.callId, decision })
			});
			if (!response.ok || !response.body) {
				tool.status = 'failed';
				tool.failure = 'The decision could not be applied.';
				return;
			}
			tool.status = decision === 'approve' ? 'running' : 'rejected';
			for await (const event of readNdjson(response.body)) this.apply(reply, event);
		} catch {
			tool.status = 'failed';
			tool.failure = 'The agent run could not resume.';
		} finally {
			this.isStreaming = false;
		}
	}

	private apply(reply: ChatEntry, event: AgentEvent): void {
		if (event.type === 'text_delta') reply.text += event.text;
		else if (event.type === 'tool_started')
			reply.tools.push({
				callId: event.callId,
				name: event.name,
				arguments: event.arguments,
				status: 'running'
			});
		else if (event.type === 'tool_completed') {
			const tool = reply.tools.find((item) => item.callId === event.callId);
			if (tool) {
				tool.status = event.failure ? 'failed' : 'succeeded';
				tool.output = event.output;
				tool.failure = event.failure;
			}
		} else if (event.type === 'approval_required') {
			const existing = reply.tools.find((item) => item.callId === event.callId);
			const activity = existing ?? {
				callId: event.callId,
				name: event.name,
				arguments: event.arguments,
				status: 'approval_required' as const
			};
			activity.status = 'approval_required';
			activity.runId = event.runId;
			if (!existing) reply.tools.push(activity);
		} else if (event.type === 'suggestion')
			reply.suggestions.push(suggestionToView(event.suggestion, 'agent'));
		else if (event.type === 'completed') this.conversationId = event.conversationId;
	}

	clear(): void {
		this.entries = [];
		this.conversationId = undefined;
		this.modelOverride = null;
		if (browser) sessionStorage.removeItem(STORAGE_KEY);
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
