import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from '$lib/server/request-actor-factory';
import { MAX_BUNDLE_ENTRIES } from '$lib/models/deliverables';
import type {
	ArtifactId,
	GenerateBundleInput,
	GenerateDocumentInput,
	PreviewDocumentInput,
	TemplateId
} from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';
import type { NoteId } from '$lib/models/notes';

export const initiateTemplateUpload = command(
	z.object({
		projectId: z.string().uuid(),
		name: z.string().min(1),
		mediaType: z.string(),
		byteSize: z.number(),
		checksumSha256: z.string()
	}),
	async (input) =>
		AppFactory.controllers()
			.deliverables()
			.initiateTemplateUpload(requestActor(), {
				...input,
				projectId: input.projectId as ProjectId
			})
);

export const completeTemplateUpload = command(
	z.object({ templateId: z.string().uuid() }),
	async (input) =>
		AppFactory.controllers()
			.deliverables()
			.completeTemplateUpload(requestActor(), input.templateId as TemplateId)
);

export const listTemplates = query(z.string().uuid(), async (projectId) =>
	AppFactory.controllers()
		.deliverables()
		.listTemplates(requestActor(), projectId as ProjectId)
);

export const deleteTemplate = command(z.object({ templateId: z.string().uuid() }), async (input) =>
	AppFactory.controllers()
		.deliverables()
		.deleteTemplate(requestActor(), input.templateId as TemplateId)
);

const exportSettingsSchema = z.object({
	fontFamily: z.enum(['helvetica', 'times', 'courier']),
	fontSize: z.number().min(8).max(18),
	lineHeight: z.number().min(1).max(2.2),
	margin: z.number().min(18).max(144),
	includeTitle: z.boolean().optional()
});

const diagramSizesSchema = z
	.record(z.string(), z.object({ width: z.number().positive(), height: z.number().positive() }))
	.optional();

export const generateDocument = command(
	z.object({
		projectId: z.string().uuid(),
		noteIds: z.array(z.string().uuid()),
		title: z.string().min(1),
		format: z.enum(['docx', 'pdf']),
		templateId: z.string().uuid().optional(),
		settings: exportSettingsSchema.optional(),
		diagramSvgs: z.record(z.string(), z.string()).optional(),
		diagramPngs: z.record(z.string(), z.string()).optional(),
		diagramSizes: diagramSizesSchema
	}),
	async (input) =>
		AppFactory.controllers()
			.deliverables()
			.generateDocument(requestActor(), input as GenerateDocumentInput)
);

export const generateBundle = command(
	z.object({
		projectId: z.string().uuid(),
		entries: z
			.array(z.object({ noteId: z.string().uuid(), path: z.string().min(1).max(400) }))
			.min(1)
			.max(MAX_BUNDLE_ENTRIES),
		title: z.string().min(1),
		format: z.enum(['docx', 'pdf']),
		templateId: z.string().uuid().optional(),
		settings: exportSettingsSchema.optional(),
		diagramSvgs: z.record(z.string(), z.string()).optional(),
		diagramPngs: z.record(z.string(), z.string()).optional(),
		diagramSizes: diagramSizesSchema
	}),
	async (input) =>
		AppFactory.controllers()
			.deliverables()
			.generateBundle(requestActor(), {
				...input,
				projectId: input.projectId as ProjectId,
				entries: input.entries.map((entry) => ({ ...entry, noteId: entry.noteId as NoteId }))
			} as GenerateBundleInput)
);

export const previewDocument = command(
	z.object({
		projectId: z.string().uuid(),
		noteIds: z.array(z.string().uuid()),
		title: z.string().min(1),
		settings: exportSettingsSchema.optional(),
		diagramSvgs: z.record(z.string(), z.string()).optional(),
		diagramPngs: z.record(z.string(), z.string()).optional(),
		diagramSizes: diagramSizesSchema
	}),
	async (input) =>
		AppFactory.controllers()
			.deliverables()
			.previewDocument(requestActor(), input as PreviewDocumentInput)
);

export const getExportSettings = query(z.string().uuid(), async (projectId) =>
	AppFactory.controllers()
		.deliverables()
		.getExportSettings(requestActor(), projectId as ProjectId)
);

export const updateExportSettings = command(
	z.object({ projectId: z.string().uuid(), settings: exportSettingsSchema }),
	async (input) =>
		AppFactory.controllers()
			.deliverables()
			.updateExportSettings(requestActor(), input.projectId as ProjectId, input.settings)
);

export const listArtifacts = query(z.string().uuid(), async (projectId) =>
	AppFactory.controllers()
		.deliverables()
		.listArtifacts(requestActor(), projectId as ProjectId)
);

export const downloadArtifact = command(
	z.object({ artifactId: z.string().uuid() }),
	async (input) =>
		AppFactory.controllers()
			.deliverables()
			.downloadArtifact(requestActor(), input.artifactId as ArtifactId)
);

export const deleteArtifact = command(z.object({ artifactId: z.string().uuid() }), async (input) =>
	AppFactory.controllers()
		.deliverables()
		.deleteArtifact(requestActor(), input.artifactId as ArtifactId)
);

export const regenerateArtifact = command(
	z.object({ artifactId: z.string().uuid() }),
	async (input) =>
		AppFactory.controllers()
			.deliverables()
			.regenerateArtifact(requestActor(), input.artifactId as ArtifactId)
);
