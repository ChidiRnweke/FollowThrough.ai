import type { ActorContext } from '$lib/models/identity';
import type {
	ArtifactRepository,
	ExportSettingsRepository,
	TemplateRepository
} from '$lib/server/repositories/deliverables';
import type { DateTime } from '$lib/models/workspace';
import {
	ArtifactLibrary,
	ArtifactSettingsService,
	type ArtifactStore,
	type ExportSettingsStore
} from '$lib/server/services/deliverables/artifacts';
import { TemplateLibrary, type TemplateStore } from '$lib/server/services/deliverables/templates';

export interface ArtifactServices {
	readonly artifactStore: ArtifactStore;
	readonly exportSettings: ExportSettingsStore;
}
export const createArtifactServices = (
	artifacts: ArtifactRepository,
	settings: ExportSettingsRepository
): ArtifactServices => ({
	artifactStore: new ArtifactLibrary(artifacts),
	exportSettings: new ArtifactSettingsService(settings)
});
export const createTemplateServices = (
	actor: ActorContext,
	repository: TemplateRepository,
	now: () => DateTime = () => new Date().toISOString() as DateTime
): TemplateStore => new TemplateLibrary(actor, repository, now);
