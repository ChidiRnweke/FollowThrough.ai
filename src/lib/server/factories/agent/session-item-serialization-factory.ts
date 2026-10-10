import type { SessionItemSerialization } from '$lib/models/agent';
import { SessionItemSerializationAdapter } from '$lib/server/adapters/agent/session-item-serialization';

export const createSessionItemSerialization = (): SessionItemSerialization =>
	new SessionItemSerializationAdapter();
