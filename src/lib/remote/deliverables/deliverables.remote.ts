import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import { MAX_BUNDLE_ENTRIES } from '$lib/models/deliverables';
import type { ArtifactId, PreviewDocumentInput, TemplateId } from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';
import type { NoteId } from '$lib/models/notes';

const projectIdSchema = z.uuid().transform((value) => value as ProjectId);
const noteIdSchema = z.uuid().transform((value) => value as NoteId);
const templateIdSchema = z.uuid().transform((value) => value as TemplateId);
const artifactIdSchema = z.uuid().transform((value) => value as ArtifactId);

export const initiateTemplateUpload = command(
	z.object({
		projectId: projectIdSchema,
		name: z.string().min(1),
		mediaType: z.string(),
		byteSize: z.number(),
		checksumSha256: z.string()
	}),
	async (input) =>
		AppFactory.controllers()
			.deliverables()
			.initiateTemplateUpload(requestActor(), {
				...input
			})
);

export const completeTemplateUpload = command(
	z.object({ templateId: templateIdSchema }),
	async (input) =>
		AppFactory.controllers().deliverables().completeTemplateUpload(requestActor(), input.templateId)
);

export const deleteTemplate = command(z.object({ templateId: templateIdSchema }), async (input) =>
	AppFactory.controllers().deliverables().deleteTemplate(requestActor(), input.templateId)
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
		projectId: projectIdSchema,
		noteIds: z.array(noteIdSchema),
		title: z.string().min(1),
		format: z.enum(['docx', 'pdf']),
		templateId: templateIdSchema.optional(),
		settings: exportSettingsSchema.optional(),
		diagramSvgs: z.record(z.string(), z.string()).optional(),
		diagramPngs: z.record(z.string(), z.string()).optional(),
		diagramSizes: diagramSizesSchema
	}),
	async (input) => AppFactory.controllers().deliverables().generateDocument(requestActor(), input)
);

export const generateBundle = command(
	z.object({
		projectId: projectIdSchema,
		entries: z
			.array(z.object({ noteId: noteIdSchema, path: z.string().min(1).max(400) }))
			.min(1)
			.max(MAX_BUNDLE_ENTRIES),
		title: z.string().min(1),
		format: z.enum(['docx', 'pdf']),
		templateId: templateIdSchema.optional(),
		settings: exportSettingsSchema.optional(),
		diagramSvgs: z.record(z.string(), z.string()).optional(),
		diagramPngs: z.record(z.string(), z.string()).optional(),
		diagramSizes: diagramSizesSchema
	}),
	async (input) => AppFactory.controllers().deliverables().generateBundle(requestActor(), input)
);

export const previewDocument = command(
	z.object({
		projectId: projectIdSchema,
		noteIds: z.array(noteIdSchema),
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

export const getExportSettings = query(projectIdSchema, async (projectId) =>
	AppFactory.controllers().deliverables().getExportSettings(requestActor(), projectId)
);

export const updateExportSettings = command(
	z.object({ projectId: projectIdSchema, settings: exportSettingsSchema }),
	async (input) =>
		AppFactory.controllers()
			.deliverables()
			.updateExportSettings(requestActor(), input.projectId, input.settings)
);

export const downloadArtifact = command(z.object({ artifactId: artifactIdSchema }), async (input) =>
	AppFactory.controllers().deliverables().downloadArtifact(requestActor(), input.artifactId)
);

export const deleteArtifact = command(z.object({ artifactId: artifactIdSchema }), async (input) =>
	AppFactory.controllers().deliverables().deleteArtifact(requestActor(), input.artifactId)
);

export const regenerateArtifact = command(
	z.object({ artifactId: artifactIdSchema }),
	async (input) =>
		AppFactory.controllers().deliverables().regenerateArtifact(requestActor(), input.artifactId)
);
