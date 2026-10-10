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
	ReferenceReadingService,
	ReferenceWritingService,
	type ReferenceCreator,
	type ReferenceLister,
	type ReferenceContextReader
} from '$lib/server/services/references/library';
import type { ReferenceRepository } from '$lib/server/repositories/references/references';
import { ReferenceDiscovery } from '$lib/server/services/references/discovery';
import { ReferenceResearch } from '$lib/server/adapters/references/web-research';
import { ReferenceRanking, type ReferenceRanker } from '$lib/server/services/references/ranking';
import type { WebReferenceClient } from '$lib/server/controllers/references/controller';
import type { ReferenceCandidatePreparation } from '$lib/server/services/references/discovery';
import type { AgentRunSettings } from '$lib/services/agent/run-settings';
import type { WebResearchOptions } from '$lib/models/agent';
import { operationObserver } from '$lib/server/services/telemetry';
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
}

export interface ReferencesCapability extends ReferenceServices {
	readonly ranking: ReferenceRanker;
	readonly model: string;
	readonly client: WebReferenceClient;
	readonly candidates: ReferenceCandidatePreparation;
	readonly settings: AgentRunSettings;
	readonly overrides: WebResearchOptions;
}

export const createReferencesCapability = (
	input: ReferencesCapabilityInput
): ReferencesCapability => ({
	ranking: new ReferenceRanking(),
	model: normalizeLanguageModelId(input.defaultModel),
	...createReferenceServices(
		new ReferenceRecords(input.db),
		input.notes,
		input.anchors,
		input.provenance
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
	readonly lister: ReferenceLister;
	readonly contexts: ReferenceContextReader;
}
export const createReferenceServices = (
	references: ReferenceRepository,
	notes: NoteRepository,
	anchors: SourceAnchorRepository,
	provenance: ProvenanceRepository
): ReferenceServices => {
	const reading = new ReferenceReadingService(references, notes, anchors);
	return {
		creator: new ReferenceWritingService(references, notes, anchors, provenance),
		lister: reading,
		contexts: reading
	};
};
