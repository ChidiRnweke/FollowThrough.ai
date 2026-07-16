import type {
	AgentEvent,
	AgentExecutionMode,
	ConversationId,
	NoteId,
	RunAgentInput,
	SuggestionView,
	Message
} from '$lib/models';
import { suggestionToView } from './suggestion-view';
import { reconcileToolActivity, type ChatToolActivity, type ChatToolStatus } from './chat-tools';

export type { ChatToolActivity } from './chat-tools';

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

export interface ContextChip {
	readonly kind: 'note' | 'skill';
	readonly id: NoteId;
	readonly name: string;
}

export type ChatPart = { kind: 'text'; text: string } | { kind: 'tool'; tool: ChatToolActivity };

export interface ChatEntry {
	readonly id: string;
	readonly role: 'user' | 'assistant';
	/** Text segments and tool calls in stream arrival order, so tools render inline. */
	parts: ChatPart[];
	suggestions: SuggestionView[];
}

const entryTools = (entry: ChatEntry): ChatToolActivity[] =>
	entry.parts.filter((part) => part.kind === 'tool').map((part) => part.tool);

const hasText = (entry: ChatEntry): boolean =>
	entry.parts.some((part) => part.kind === 'text' && part.text.length > 0);

/** Merge a tool event into the entry, appending a new inline part when it is unseen. */
const applyToolActivity = (entry: ChatEntry, incoming: ChatToolActivity): void => {
	if (!reconcileToolActivity(entryTools(entry), incoming)) {
		entry.parts.push({ kind: 'tool', tool: incoming });
	}
};

const appendText = (entry: ChatEntry, text: string): void => {
	const last = entry.parts.at(-1);
	if (last?.kind === 'text') last.text += text;
	else entry.parts.push({ kind: 'text', text });
};

class ChatStore {
	entries = $state<ChatEntry[]>([]);
	isStreaming = $state(false);
	conversationId = $state<ConversationId | undefined>(undefined);
	modelOverride = $state<string | null>(null);
	executionModeOverride = $state<AgentExecutionMode>('approval_required');
	initialized = $state(false);
	chips = $state<ContextChip[]>([]);
	// The auto chip for the open note reappears when a different note opens.
	autoChipDismissedFor = $state<NoteId | undefined>(undefined);
	private hydratedConversationId?: ConversationId;

	initialize(defaultMode: AgentExecutionMode): void {
		if (this.initialized) return;
		const persisted = persistedConversation();
		this.conversationId = persisted.conversationId;
		this.modelOverride = persisted.modelOverride ?? null;
		this.executionModeOverride = persisted.executionModeOverride ?? defaultMode;
		this.initialized = true;
	}

	async hydrate(): Promise<void> {
		if (
			!browser ||
			!this.conversationId ||
			this.hydratedConversationId === this.conversationId ||
			this.isStreaming
		)
			return;
		const conversationId = this.conversationId;
		try {
			const response = await fetch(`/api/agent/sessions/${conversationId}`);
			if (!response.ok) return;
			const data = (await response.json()) as { messages: readonly Message[] };
			const entries: ChatEntry[] = [];
			let pendingTools: ChatToolActivity[] = [];
			for (const message of data.messages) {
				if (message.role === 'tool') {
					const content = message.content;
					const incoming: ChatToolActivity = {
						callId: String(content.callId ?? ''),
						name: String(content.name ?? 'tool'),
						arguments: (content.input ?? {}) as Readonly<Record<string, unknown>>,
						...(content.output !== null ? { output: content.output } : {}),
						...(typeof content.failure === 'string' ? { failure: content.failure } : {}),
						status: String(content.status ?? 'succeeded') as ChatToolStatus
					};
					if (!reconcileToolActivity(pendingTools, incoming)) pendingTools.push(incoming);
					continue;
				}
				const text = typeof message.content.text === 'string' ? message.content.text : '';
				const toolParts: ChatPart[] =
					message.role === 'assistant' ? pendingTools.map((tool) => ({ kind: 'tool', tool })) : [];
				entries.push({
					id: message.id,
					role: message.role,
					parts: [...toolParts, ...(text ? [{ kind: 'text' as const, text }] : [])],
					suggestions: []
				});
				if (message.role === 'assistant') pendingTools = [];
			}
			this.entries = entries;
			this.hydratedConversationId = conversationId;
		} catch {
			// A stale session ID should not prevent starting a new conversation.
		}
	}

	persistConversationChoices(): void {
		if (!browser || !this.initialized) return;
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
			parts: [{ kind: 'text', text: input.prompt }],
			suggestions: []
		});
		this.entries.push({
			id: crypto.randomUUID(),
			role: 'assistant',
			parts: [],
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
				appendText(reply, 'The agent is unavailable. Try again.');
				return;
			}
			for await (const event of readNdjson(response.body)) {
				this.apply(reply, event);
			}
		} catch {
			if (!hasText(reply)) appendText(reply, 'The agent run failed. Try again.');
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
		if (event.type === 'text_delta') appendText(reply, event.text);
		else if (event.type === 'tool_started')
			applyToolActivity(reply, {
				callId: event.callId,
				name: event.name,
				arguments: event.arguments,
				status: 'running'
			});
		else if (event.type === 'tool_completed') {
			applyToolActivity(reply, {
				callId: event.callId,
				name: event.name,
				arguments: {},
				...(event.output === undefined ? {} : { output: event.output }),
				...(event.failure === undefined ? {} : { failure: event.failure }),
				status: event.failure ? 'failed' : 'succeeded'
			});
		} else if (event.type === 'approval_required') {
			applyToolActivity(reply, {
				callId: event.callId,
				name: event.name,
				arguments: event.arguments,
				runId: event.runId,
				status: 'approval_required'
			});
		} else if (event.type === 'suggestion')
			reply.suggestions.push(suggestionToView(event.suggestion, 'agent'));
		else if (event.type === 'failed') {
			if (!hasText(reply)) appendText(reply, event.message);
		} else if (event.type === 'completed') this.conversationId = event.conversationId;
	}

	clear(): void {
		this.entries = [];
		this.conversationId = undefined;
		this.modelOverride = null;
		this.chips = [];
		this.autoChipDismissedFor = undefined;
		this.hydratedConversationId = undefined;
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
