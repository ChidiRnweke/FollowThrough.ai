import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import type { ArtifactId, GenerateDocumentInput, ProjectId, TemplateId } from '$lib/models';

export const initiateTemplateUpload = command(
	z.object({
		projectId: z.string().uuid(),
		name: z.string().min(1),
		mediaType: z.string(),
		byteSize: z.number(),
		checksumSha256: z.string()
	}),
	async (input) =>
		AppFactory.controllerFactory()
			.deliverables()
			.initiateTemplateUpload(AppFactory.actor(), { ...input, projectId: input.projectId as ProjectId })
);

export const completeTemplateUpload = command(
	z.object({ templateId: z.string().uuid() }),
	async (input) =>
		AppFactory.controllerFactory()
			.deliverables()
			.completeTemplateUpload(AppFactory.actor(), input.templateId as TemplateId)
);

export const listTemplates = query(z.string().uuid(), async (projectId) =>
	AppFactory.controllerFactory()
		.deliverables()
		.listTemplates(AppFactory.actor(), projectId as ProjectId)
);

export const deleteTemplate = command(
	z.object({ templateId: z.string().uuid() }),
	async (input) =>
		AppFactory.controllerFactory()
			.deliverables()
			.deleteTemplate(AppFactory.actor(), input.templateId as TemplateId)
);

export const generateDocument = command(
	z.object({
		projectId: z.string().uuid(),
		noteIds: z.array(z.string().uuid()),
		title: z.string().min(1),
		format: z.enum(['docx', 'pdf']),
		templateId: z.string().uuid().optional()
	}),
	async (input) =>
		AppFactory.controllerFactory()
			.deliverables()
			.generateDocument(AppFactory.actor(), input as GenerateDocumentInput)
);

export const listArtifacts = query(z.string().uuid(), async (projectId) =>
	AppFactory.controllerFactory()
		.deliverables()
		.listArtifacts(AppFactory.actor(), projectId as ProjectId)
);

export const downloadArtifact = command(
	z.object({ artifactId: z.string().uuid() }),
	async (input) =>
		AppFactory.controllerFactory()
			.deliverables()
			.downloadArtifact(AppFactory.actor(), input.artifactId as ArtifactId)
);

export const deleteArtifact = command(
	z.object({ artifactId: z.string().uuid() }),
	async (input) =>
		AppFactory.controllerFactory()
			.deliverables()
			.deleteArtifact(AppFactory.actor(), input.artifactId as ArtifactId)
);

export const regenerateArtifact = command(
	z.object({ artifactId: z.string().uuid() }),
	async (input) =>
		AppFactory.controllerFactory()
			.deliverables()
			.regenerateArtifact(AppFactory.actor(), input.artifactId as ArtifactId)
);
