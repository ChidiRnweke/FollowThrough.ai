import type { ControllerFactory } from '$lib/server/controller-factory';
import type { ActorContext, UserId } from '$lib/models/identity';
import type { ProvenanceId } from '$lib/models/provenance';
import type { ToolCatalog, ToolCatalogEntry } from '$lib/server/services/agent/tools/preferences';
import { AgentTools, LOCKED_TOOL_NAMES } from './agent-tool-factory';

/**
 * A `ControllerFactory` that exists only to satisfy the registry's constructor.
 *
 * `buildDefinitions` reaches for controllers inside each tool's `execute`
 * closure, never while defining one, so describing the catalog touches nothing.
 * Throwing rather than returning a stub keeps that guarantee honest: if a future
 * tool resolves a controller at define time, the catalog spec fails loudly
 * instead of quietly capturing a fake.
 */
const inertControllers = new Proxy({} as ControllerFactory, {
	get(_target, property) {
		throw new Error(
			`describeAgentTools() touched controllers.${String(property)}(); tool definitions must not resolve controllers before they execute.`
		);
	}
});

const CATALOG_ACTOR: ActorContext = {
	userId: '00000000-0000-0000-0000-000000000000' as UserId
};

/**
 * Every agent tool's metadata, derived from the same `buildDefinitions` the
 * agent runs on, so the settings surface can never drift from what exists.
 *
 * Cheap enough to call per request (it allocates Zod schemas and closures, no
 * I/O) and deliberately not cached, so a tool added in dev shows up on reload.
 */
export const describeAgentTools = (): readonly ToolCatalogEntry[] =>
	new AgentTools(inertControllers, CATALOG_ACTOR, 'auto_accept', {
		provenanceId: '00000000-0000-0000-0000-000000000000' as ProvenanceId,
		input: { prompt: '' },
		model: 'catalog'
	})
		.definitions()
		.map((definition) => ({
			name: definition.name,
			description: definition.description,
			classification: definition.classification,
			locked: LOCKED_TOOL_NAMES.includes(definition.name)
		}));

/** The production `ToolCatalog`, for injection into the preference store. */
export const agentToolCatalog: ToolCatalog = { entries: describeAgentTools };
