import {
	agentPayloadResultSchema,
	type AgentPayload,
	type AgentPayloadObject
} from '$lib/models/agent/payload';

interface CreatedRange {
	readonly createdAfter?: string;
	readonly createdBefore?: string;
}

const isPayloadObject = (value: AgentPayload): value is AgentPayloadObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const createdRange = (args: AgentPayloadObject): CreatedRange => {
	const { createdAfter, createdBefore } = args;
	return {
		...(typeof createdAfter === 'string' ? { createdAfter } : {}),
		...(typeof createdBefore === 'string' ? { createdBefore } : {})
	};
};

const withinCreatedRange = (createdAt: string, range: CreatedRange): boolean =>
	(!range.createdAfter || createdAt >= range.createdAfter) &&
	(!range.createdBefore || createdAt <= range.createdBefore);

/** A row is kept unless it carries a `createdAt` outside the range the model asked for. */
const filterCreated = (value: AgentPayload, range: CreatedRange): AgentPayload => {
	if (Array.isArray(value))
		return value
			.filter((item) => {
				if (!isPayloadObject(item)) return true;
				const { createdAt } = item;
				return typeof createdAt !== 'string' || withinCreatedRange(createdAt, range);
			})
			.map((item) => filterCreated(item, range));
	if (!isPayloadObject(value)) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, filterCreated(item, range)])
	);
};

/**
 * A tool's output: the operation's result checked to be JSON the model and the event log can
 * carry, narrowed to the creation-time range the call asked for.
 */
export const toolResult = <Result>(result: Result, args: AgentPayloadObject): AgentPayload => {
	const read = agentPayloadResultSchema.parse(result);
	if (read.kind === 'corrupt')
		throw new Error(`Tool output could not be represented as JSON: ${read.message}`);
	return filterCreated(read.value, createdRange(args));
};
