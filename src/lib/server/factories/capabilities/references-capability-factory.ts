import type { DateTime } from '$lib/models/workspace';
import type { ActorContext } from '$lib/models/identity';
import { webSearchOptionsFromEnvironment } from '$lib/server/factories/agent/web-research-configuration';
import { AgentRunSettingsService } from '$lib/services/agent/run-settings';

import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { ReferenceRecords } from '$lib/server/repositories/references/postgres/references';
import {
	ReferenceLibrary,
	type ReferenceCreator,
	type ReferenceReader
} from '$lib/server/services/references/library';
import type { ReferenceRepository } from '$lib/server/repositories/references/references';
import {
	ReferenceDiscovery,
	type ReferenceCandidates
} from '$lib/server/services/references/discovery';
import { ReferenceResearch } from '$lib/server/services/references/web-research';
import type { WebReferenceClient } from '$lib/server/services/references/web-research';
import type { AgentRunSettings } from '$lib/services/agent/run-settings';
import type { WebResearchOptions } from '$lib/models/agent';
import { operationObserver } from '$lib/server/infrastructure/telemetry/tracing';
import { normalizeLanguageModelId } from '$lib/models/agent';

export interface ReferencesCapabilityInput {
	readonly db: Database;
	readonly notes: NoteRepository;
	readonly anchors: SourceAnchorRepository;
	readonly provenance: ProvenanceRepository;
	readonly openRouterApiKey: string;
	readonly openRouterBaseURL: string;
	readonly appURL: string;
	readonly defaultModel: string;
	readonly client?: WebReferenceClient;
	readonly now: () => DateTime;
}

export interface ReferencesCapability extends ReferenceServices {
	readonly model: string;
	readonly client: WebReferenceClient;
	readonly candidates: ReferenceCandidates;
	readonly settings: AgentRunSettings;
	readonly overrides: WebResearchOptions;
}

export const createReferencesCapability = (
	actor: ActorContext,
	input: ReferencesCapabilityInput
): ReferencesCapability => ({
	model: normalizeLanguageModelId(input.defaultModel),
	...createReferenceServices(
		actor,
		new ReferenceRecords(actor, input.db),
		input.notes,
		input.anchors,
		input.provenance,
		input.now
	),
	client:
		input.client ??
		new ReferenceResearch(input.openRouterApiKey, {
			baseURL: input.openRouterBaseURL,
			appURL: input.appURL,
			defaultModel: normalizeLanguageModelId(input.defaultModel),
			observer: operationObserver
		}),
	candidates: new ReferenceDiscovery(),
	settings: new AgentRunSettingsService(),
	overrides: webSearchOptionsFromEnvironment(process.env)
});

export interface ReferenceServices {
	readonly creator: ReferenceCreator;
	readonly reader: ReferenceReader;
}
export const createReferenceServices = (
	actor: ActorContext,
	references: ReferenceRepository,
	notes: NoteRepository,
	anchors: SourceAnchorRepository,
	provenance: ProvenanceRepository,
	now: () => DateTime
): ReferenceServices => {
	const library = new ReferenceLibrary(actor, references, notes, anchors, provenance, now);
	return { creator: library, reader: library };
};
