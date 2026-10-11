import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { Database } from '$lib/server/db';
import { ToolContextLogRecords } from '$lib/server/repositories/context-usage/postgres/tool-context-log';
import {
	ProjectContextUsageService,
	type ProjectContextUsage
} from '$lib/server/services/context-usage/usage';

export interface ContextUsageCapabilityInput {
	readonly db: Database;
	readonly now: () => DateTime;
}

export interface ContextUsageCapability {
	readonly usage: ProjectContextUsage;
}

export const createContextUsageCapability = (
	actor: ActorContext,
	input: ContextUsageCapabilityInput
): ContextUsageCapability => ({
	usage: new ProjectContextUsageService(new ToolContextLogRecords(actor, input.db), input.now)
});
