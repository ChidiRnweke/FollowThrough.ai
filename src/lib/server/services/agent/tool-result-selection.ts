import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
export interface AgentToolResultSelector {
	select(value: AgentPayload, arguments_: AgentPayloadObject): AgentPayload;
}
export class AgentToolResultSelection implements AgentToolResultSelector {
	select(value: AgentPayload, arguments_: AgentPayloadObject): AgentPayload {
		return this.filterCreated(value, this.range(arguments_));
	}
	private withinCreatedRange(
		createdAt: string,
		range: { readonly createdAfter?: string; readonly createdBefore?: string }
	): boolean {
		return (
			(!range.createdAfter || createdAt >= range.createdAfter) &&
			(!range.createdBefore || createdAt <= range.createdBefore)
		);
	}
	private filterCreated(
		value: AgentPayload,
		range: { createdAfter?: string; createdBefore?: string }
	): AgentPayload {
		const items = Array.isArray(value) ? value : undefined;
		if (items)
			return items
				.filter((item) => {
					if (!(item !== null && typeof item === 'object' && !Array.isArray(item))) return true;
					const createdAt = item.createdAt;
					return typeof createdAt !== 'string' || this.withinCreatedRange(createdAt, range);
				})
				.map((item) => this.filterCreated(item, range));
		if (!(value !== null && typeof value === 'object' && !Array.isArray(value))) return value;
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, this.filterCreated(item, range)])
		);
	}
	private range(value: AgentPayloadObject): { createdAfter?: string; createdBefore?: string } {
		const createdAfter = 'createdAfter' in value ? value.createdAfter : undefined;
		const createdBefore = 'createdBefore' in value ? value.createdBefore : undefined;
		return {
			...(typeof createdAfter === 'string' ? { createdAfter } : {}),
			...(typeof createdBefore === 'string' ? { createdBefore } : {})
		};
	}
}
