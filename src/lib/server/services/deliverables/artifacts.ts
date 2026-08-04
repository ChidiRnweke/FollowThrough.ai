import { randomUUID } from 'node:crypto';
import type { ActorContext } from '$lib/models/identity';
import type {
	Artifact,
	ArtifactId,
	DiagramRenders,
	ListArtifactsOutput,
	ListArtifactsParams,
	ExportSettings,
	ExtractedTemplateStyles,
	GenerateDocumentInput,
	PreviewDocumentInput
} from '$lib/models/deliverables';
import type { DateTime } from '$lib/models/workspace';
import type { Note, NoteId, ProseMirrorDocument } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { Provenance } from '$lib/models/provenance';
import { defaultExportSettings } from '$lib/models/deliverables';
import { NotFoundError, ValidationError } from '$lib/errors';
import type {
	ArtifactRepository,
	ExportSettingsRepository,
	TemplateRepository
} from '$lib/server/repositories/deliverables';
import type { TransactionRunner } from '$lib/server/repositories/workspace/transaction';
interface ArtifactStorage {
	put(objectKey: string, data: Uint8Array, mediaType: string): Promise<void>;
	createDownloadUrl(
		objectKey: string,
		expiresInSeconds: number,
		downloadFilename?: string
	): Promise<string>;
	remove(objectKey: string): Promise<void>;
}
interface ProvenanceRecorder {
	record(
		actor: ActorContext,
		input: Omit<Provenance, 'id' | 'userId' | 'createdAt'>
	): Promise<Provenance>;
}
interface NoteReader {
	get(actor: ActorContext, noteId: NoteId): Promise<Note>;
}
interface GenerateDocxInput extends DiagramRenders {
	readonly notes: readonly { title: string; document: ProseMirrorDocument }[];
	readonly title: string;
	readonly styles?: ExtractedTemplateStyles;
	readonly settings?: ExportSettings;
}
interface GeneratePdfInput extends DiagramRenders {
	readonly notes: readonly { title: string; document: ProseMirrorDocument }[];
	readonly title: string;
	readonly styles?: ExtractedTemplateStyles;
	readonly settings?: ExportSettings;
}

/** Absent render maps are left off entirely, so the generators' own defaults stay in charge. */
const diagramRenders = (input: DiagramRenders): DiagramRenders => ({
	...(input.diagramSvgs ? { diagramSvgs: input.diagramSvgs } : {}),
	...(input.diagramPngs ? { diagramPngs: input.diagramPngs } : {}),
	...(input.diagramSizes ? { diagramSizes: input.diagramSizes } : {})
});

const now = (): DateTime => new Date().toISOString() as DateTime;

const downloadFilename = (artifact: Artifact): string =>
	`${artifact.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'document'}.${artifact.format}`;

const validateSettings: (settings: ExportSettings) => ExportSettings = (
	settings: ExportSettings
): ExportSettings => {
	if (!['helvetica', 'times', 'courier'].includes(settings.fontFamily))
		throw new ValidationError('Unknown export font family');
	const within = (value: number, minimum: number, maximum: number): boolean =>
		Number.isFinite(value) && value >= minimum && value <= maximum;
	if (!within(settings.fontSize, 8, 18))
		throw new ValidationError('Export font size must be between 8 and 18 points');
	if (!within(settings.lineHeight, 1, 2.2))
		throw new ValidationError('Export line height must be between 1 and 2.2');
	if (!within(settings.margin, 18, 144))
		throw new ValidationError('Export margin must be between 18 and 144 points');
	return {
		fontFamily: settings.fontFamily,
		fontSize: settings.fontSize,
		lineHeight: settings.lineHeight,
		margin: settings.margin
	};
};

export class ArtifactLibrary {
	constructor(
		private readonly artifactRepo: ArtifactRepository,
		private readonly storage: ArtifactStorage,
		private readonly docxGenerator: (input: GenerateDocxInput) => Promise<Buffer>,
		private readonly pdfGenerator: (input: GeneratePdfInput) => Promise<Buffer>,
		private readonly provenanceRecorder: ProvenanceRecorder,
		private readonly noteReader: NoteReader,
		private readonly templateRepo: TemplateRepository,
		private readonly transactionRunner: TransactionRunner,
		private readonly settingsRepo: ExportSettingsRepository
	) {}

	async getSettings(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings> {
		return (await this.settingsRepo.find(actor, projectId)) ?? defaultExportSettings;
	}

	async updateSettings(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings> {
		return this.settingsRepo.upsert(actor, projectId, validateSettings(settings));
	}

	async preview(actor: ActorContext, input: PreviewDocumentInput): Promise<Buffer> {
		const notes = await this.loadNotes(actor, input.noteIds);
		const settings = input.settings
			? validateSettings(input.settings)
			: await this.getSettings(actor, input.projectId);
		return this.pdfGenerator({
			notes,
			title: input.title,
			settings,
			...diagramRenders(input)
		});
	}

	private async loadNotes(
		actor: ActorContext,
		noteIds: readonly NoteId[]
	): Promise<{ title: string; document: ProseMirrorDocument }[]> {
		return Promise.all(
			noteIds.map(async (noteId) => {
				const note = await this.noteReader.get(actor, noteId);
				if (!note) throw new NotFoundError(`Note ${noteId} not found`);
				return { title: note.title, document: note.document };
			})
		);
	}

	async generate(
		actor: ActorContext,
		input: GenerateDocumentInput
	): Promise<{ artifact: Artifact; downloadUrl: string }> {
		const notes = await this.loadNotes(actor, input.noteIds);
		const settings = input.settings
			? validateSettings(input.settings)
			: await this.getSettings(actor, input.projectId);

		let extractedStyles;
		if (input.templateId) {
			const template = await this.templateRepo.findById(actor, input.templateId);
			if (template?.extractedStyles) {
				extractedStyles =
					template.extractedStyles as unknown as ExtractedTemplateStyles;
			}
		}

		let buffer: Buffer;
		if (input.format === 'docx') {
			buffer = await this.docxGenerator({
				notes,
				...(extractedStyles ? { styles: extractedStyles } : {}),
				title: input.title,
				settings,
				...diagramRenders(input)
			});
		} else {
			buffer = await this.pdfGenerator({
				notes,
				title: input.title,
				styles: extractedStyles,
				settings,
				...diagramRenders(input)
			});
		}

		const artifactId = randomUUID() as ArtifactId;
		const objectKey = `artifacts/${actor.userId}/${artifactId}.${input.format}`;
		const mediaType =
			input.format === 'docx'
				? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
				: 'application/pdf';
		await this.storage.put(objectKey, buffer, mediaType);

		const provenance = await this.provenanceRecorder.record(actor, {
			producerKind: 'user',
			producerName: 'document-export',
			metadata: {}
		});

		const artifact: Artifact = {
			id: artifactId,
			userId: actor.userId,
			projectId: input.projectId,
			title: input.title,
			format: input.format,
			objectKey,
			byteSize: buffer.length,
			sourceNoteIds: input.noteIds,
			templateId: input.templateId,
			provenanceId: provenance.id,
			...(provenance.runId ? { runId: provenance.runId } : {}),
			createdAt: now()
		};

		await this.transactionRunner.run(async () => {
			await this.artifactRepo.insert(actor, artifact);
		});
		const downloadUrl = await this.storage.createDownloadUrl(
			objectKey,
			3600,
			downloadFilename(artifact)
		);

		return { artifact, downloadUrl };
	}

	async list(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListArtifactsParams
	): Promise<ListArtifactsOutput> {
		return this.artifactRepo.listByProject(actor, projectId, params);
	}

	async get(actor: ActorContext, artifactId: ArtifactId): Promise<Artifact | undefined> {
		return this.artifactRepo.findById(actor, artifactId);
	}

	async download(actor: ActorContext, artifactId: ArtifactId): Promise<{ url: string }> {
		const artifact = await this.artifactRepo.findById(actor, artifactId);
		if (!artifact) throw new NotFoundError('Artifact not found');
		return {
			url: await this.storage.createDownloadUrl(
				artifact.objectKey,
				3600,
				downloadFilename(artifact)
			)
		};
	}

	async delete(actor: ActorContext, artifactId: ArtifactId): Promise<void> {
		const artifact = await this.artifactRepo.findById(actor, artifactId);
		if (!artifact) throw new NotFoundError('Artifact not found');
		await this.artifactRepo.delete(actor, artifactId);
	}

	async regenerate(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<{ artifact: Artifact; downloadUrl: string }> {
		const existing = await this.artifactRepo.findById(actor, artifactId);
		if (!existing) throw new NotFoundError('Artifact not found');

		return this.generate(actor, {
			projectId: existing.projectId,
			noteIds: existing.sourceNoteIds,
			title: existing.title,
			format: existing.format,
			templateId: existing.templateId
		});
	}
}
