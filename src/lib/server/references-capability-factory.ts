import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { ReferenceRecords } from '$lib/server/repositories/references/postgres/references';
import { ReferenceLibrary } from '$lib/server/services/references/library';
import { ReferenceDiscovery } from '$lib/server/services/references/discovery';
import type { ReferenceFinder } from '$lib/server/services/references/contracts';
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
	readonly finder?: ReferenceFinder;
}

export interface ReferencesCapability {
	readonly library: ReferenceLibrary;
	readonly finder: ReferenceFinder;
}

export const createReferencesCapability = (
	input: ReferencesCapabilityInput
): ReferencesCapability => ({
	library: new ReferenceLibrary(
		new ReferenceRecords(input.db),
		input.notes,
		input.anchors,
		input.provenance
	),
	finder:
		input.finder ??
		new ReferenceDiscovery({
			apiKey: input.openRouterApiKey,
			baseURL: input.openRouterBaseURL,
			appURL: input.appURL,
			defaultModel: normalizeLanguageModelId(input.defaultModel),
			observer: operationObserver
		})
});
