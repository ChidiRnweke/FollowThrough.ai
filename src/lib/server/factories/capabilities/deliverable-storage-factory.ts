import type {
	ArtifactRepository,
	ExportSettingsRepository,
	TemplateRepository
} from '$lib/server/repositories/deliverables';
import type { DateTime } from '$lib/models/workspace';
import {
	ArtifactWritingService,
	ArtifactReadingService,
	ArtifactLifecycleService,
	ArtifactSettingsService,
	type ArtifactWriter,
	type ArtifactReader,
	type ArtifactLister,
	type ArtifactDeleter,
	type ExportSettingsReader,
	type ExportSettingsWriter
} from '$lib/server/services/deliverables/artifacts';
import {
	TemplateUploadService,
	TemplateReadingService,
	TemplateWritingService,
	TemplateLifecycleService,
	type TemplateUploadLifecycle,
	type TemplateReader,
	type TemplateWriter,
	type TemplateLifecycle
} from '$lib/server/services/deliverables/templates';
export interface ArtifactServices {
	readonly artifactWriter: ArtifactWriter;
	readonly artifactReader: ArtifactReader;
	readonly artifactLister: ArtifactLister;
	readonly artifactDeleter: ArtifactDeleter;
	readonly exportSettingsReader: ExportSettingsReader;
	readonly exportSettingsWriter: ExportSettingsWriter;
}
export const createArtifactServices = (
	artifacts: ArtifactRepository,
	settings: ExportSettingsRepository
): ArtifactServices => {
	const reader = new ArtifactReadingService(artifacts);
	const preferences = new ArtifactSettingsService(settings);
	return {
		artifactWriter: new ArtifactWritingService(artifacts),
		artifactReader: reader,
		artifactLister: reader,
		artifactDeleter: new ArtifactLifecycleService(artifacts),
		exportSettingsReader: preferences,
		exportSettingsWriter: preferences
	};
};
export interface TemplateServices {
	readonly templateUploads: TemplateUploadLifecycle;
	readonly templateReader: TemplateReader;
	readonly templateWriter: TemplateWriter;
	readonly templateLifecycle: TemplateLifecycle;
}
export const createTemplateServices = (
	repository: TemplateRepository,
	now: () => DateTime = () => new Date().toISOString() as DateTime
): TemplateServices => ({
	templateUploads: new TemplateUploadService(repository, now),
	templateReader: new TemplateReadingService(repository),
	templateWriter: new TemplateWritingService(repository, now),
	templateLifecycle: new TemplateLifecycleService(repository)
});
