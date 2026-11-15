import { tracedService } from '$lib/server/infrastructure/telemetry/service-boundary';
import type { ActorContext } from '$lib/models/identity';
import type {
	ArtifactRepository,
	ExportSettingsRepository,
	TemplateRepository
} from '$lib/server/repositories/deliverables';
import type { DateTime } from '$lib/models/workspace';
import type { TemplateAdmissionLimits } from '$lib/models/deliverables';
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
	artifactStore: tracedService('ArtifactLibrary', new ArtifactLibrary(artifacts)),
	exportSettings: tracedService('ArtifactSettingsService', new ArtifactSettingsService(settings))
});
export const createTemplateServices = (
	actor: ActorContext,
	repository: TemplateRepository,
	now: () => DateTime,
	limits: TemplateAdmissionLimits
): TemplateStore =>
	tracedService('TemplateLibrary', new TemplateLibrary(actor, repository, now, limits));
