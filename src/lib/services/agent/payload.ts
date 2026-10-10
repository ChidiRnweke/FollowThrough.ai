import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';

/** Narrow an already parsed union; external values must first cross the Zod boundary. */
const isAgentPayloadObject = (value: AgentPayload): value is AgentPayloadObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const agentPayloadItems = (value: AgentPayload): readonly AgentPayload[] | undefined =>
	Array.isArray(value) ? value : undefined;

const withinCreatedRange = (
	createdAt: string,
	range: { readonly createdAfter?: string; readonly createdBefore?: string }
): boolean =>
	(!range.createdAfter || createdAt >= range.createdAfter) &&
	(!range.createdBefore || createdAt <= range.createdBefore);
/**
 * A row is kept unless it carries a `createdAt` outside the range. The two
 * tests used to be inline object casts — `item as { createdAt?: unknown }`, then
 * `item as { createdAt: string }` — on a value whose type already said it was
 * JSON. Indexing an {@link AgentPayloadObject} answers with another
 * `AgentPayload`, so a plain `typeof` finishes the narrowing.
 */
const filterCreated = (
	value: AgentPayload,
	range: { createdAfter?: string; createdBefore?: string }
): AgentPayload => {
	const items = agentPayloadItems(value);
	if (items)
		return items
			.filter((item) => {
				if (!isAgentPayloadObject(item)) return true;
				const createdAt = item.createdAt;
				return typeof createdAt !== 'string' || withinCreatedRange(createdAt, range);
			})
			.map((item) => filterCreated(item, range));
	if (!isAgentPayloadObject(value)) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, filterCreated(item, range)])
	);
};

const createdRange = (
	value: AgentPayloadObject
): { createdAfter?: string; createdBefore?: string } => {
	const createdAfter = 'createdAfter' in value ? value.createdAfter : undefined;
	const createdBefore = 'createdBefore' in value ? value.createdBefore : undefined;
	return {
		...(typeof createdAfter === 'string' ? { createdAfter } : {}),
		...(typeof createdBefore === 'string' ? { createdBefore } : {})
	};
};

const filterResult = (value: AgentPayload, input: AgentPayloadObject): AgentPayload =>
	filterCreated(value, createdRange(input));
export interface AgentPayloadInspection {
	filterResult(value: AgentPayload, input: AgentPayloadObject): AgentPayload;
	isAgentPayloadObject(value: AgentPayload): value is AgentPayloadObject;
	agentPayloadItems(value: AgentPayload): readonly AgentPayload[] | undefined;
}
export class AgentPayloadInspectionService implements AgentPayloadInspection {
	filterResult(value: AgentPayload, input: AgentPayloadObject): AgentPayload {
		return filterResult(value, input);
	}
	isAgentPayloadObject(value: AgentPayload): value is AgentPayloadObject {
		return isAgentPayloadObject(value);
	}
	agentPayloadItems(value: AgentPayload): readonly AgentPayload[] | undefined {
		return agentPayloadItems(value);
	}
}
