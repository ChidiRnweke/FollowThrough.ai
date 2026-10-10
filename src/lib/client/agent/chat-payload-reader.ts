import type { StoredMessage, AgentReview } from '$lib/models/agent';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { NoteChangeReview } from '$lib/models/notes';
import type { ChatJournalMessage } from '$lib/models/chat';
import type { MutableChatPart } from '$lib/models/chat';

import { readJournalledTool, readNoteReview, toolArguments } from './chat-tool-reader';
import type { ChatPayloadReader } from '$lib/controllers/agent/chat-session';
const restoredImages = (value: unknown): MutableChatPart[] => {
	if (!Array.isArray(value)) return [];
	return value
		.filter(
			(item): item is { id: string; dataUrl: string; name: string } =>
				typeof item === 'object' &&
				item !== null &&
				!Array.isArray(item) &&
				typeof item.id === 'string' &&
				typeof item.dataUrl === 'string' &&
				typeof item.name === 'string'
		)
		.map((item) => ({
			kind: 'image' as const,
			id: item.id,
			dataUrl: item.dataUrl,
			name: item.name
		}));
};

export class BrowserChatPayloadReader implements ChatPayloadReader {
	arguments(value: AgentPayload): AgentPayloadObject {
		return toolArguments(value);
	}
	review(value: AgentReview): NoteChangeReview {
		return readNoteReview(value);
	}
	messages(messages: readonly StoredMessage[]): ChatJournalMessage[] {
		return messages.map((message) => {
			let parts: MutableChatPart[];
			if (message.kind === 'unreadable') parts = [{ kind: 'unreadable', reason: message.reason }];
			else if (message.role === 'tool') {
				const read = readJournalledTool(message.content, {
					...(message.runId ? { runId: message.runId } : {})
				});
				parts =
					read.kind === 'readable'
						? [{ kind: 'tool', tool: read.tool }]
						: [
								{
									kind: 'unreadable',
									reason: `This tool call could not be read back from the transcript. ${read.reason}`
								}
							];
			} else {
				const text = typeof message.content.text === 'string' ? message.content.text : '';
				parts = [
					...(text
						? [
								{
									kind:
										message.content.type === 'reasoning'
											? ('reasoning' as const)
											: ('text' as const),
									text
								}
							]
						: []),
					...(message.role === 'user' ? restoredImages(message.content.images) : [])
				];
			}
			return {
				id: message.id,
				role: message.role,
				...(message.runId ? { runId: message.runId } : {}),
				...(message.eventCursor ? { eventCursor: message.eventCursor } : {}),
				parts
			};
		});
	}
}
