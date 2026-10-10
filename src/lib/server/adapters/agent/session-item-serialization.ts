import type {
	PersistedSessionItem,
	StoredSessionItem,
	SessionItemSerialization
} from '$lib/models/agent/session-item';
const present = <Value>(key: string, value: Value | undefined) =>
	value === undefined ? {} : { [key]: value };

/** The row as it is written back: the shape the provider sent, restored exactly. */
export class SessionItemSerializationAdapter implements SessionItemSerialization {
	serialize(item: PersistedSessionItem): StoredSessionItem {
		switch (item.type) {
			case 'user_message':
				return {
					type: 'message',
					role: 'user',
					content: item.content,
					...present('id', item.id),
					...present('providerData', item.providerData)
				};
			case 'assistant_message':
				return {
					type: 'message',
					role: 'assistant',
					status: item.status,
					content: item.content,
					...present('id', item.id),
					...present('providerData', item.providerData)
				};
			case 'function_call':
				return {
					type: 'function_call',
					callId: item.callId,
					name: item.name,
					arguments: item.arguments,
					...present('id', item.id),
					...present('status', item.status),
					...present('providerData', item.providerData)
				};
			case 'function_call_result':
				return {
					type: 'function_call_result',
					callId: item.callId,
					name: item.name,
					status: item.status,
					output: item.output,
					...present('id', item.id),
					...present('providerData', item.providerData)
				};
			case 'reasoning':
				return {
					type: 'reasoning',
					content: item.content,
					...present('rawContent', item.rawContent),
					...present('id', item.id),
					...present('providerData', item.providerData)
				};
			case 'unrecognised':
				return item.raw;
		}
	}
}
