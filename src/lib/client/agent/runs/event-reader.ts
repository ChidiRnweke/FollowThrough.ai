import { z } from 'zod';
import {
	agentRunEventFrameSchema,
	agentRunEventIdentitySchema,
	type ReadAgentRunEventRecord
} from '$lib/models/agent';

/** Keep a trusted cursor even when a different deployed version wrote the event. */
export const readAgentRunEventRecord = (value: unknown): ReadAgentRunEventRecord => {
	const parsed = agentRunEventFrameSchema.safeParse(value);
	if (parsed.success) return parsed.data;
	const identity = agentRunEventIdentitySchema.safeParse(value);
	const reason = z.prettifyError(parsed.error);
	return identity.success
		? { ...identity.data, kind: 'unreadable', reason }
		: { kind: 'invalid', reason };
};
