import { randomUUID } from 'node:crypto';
import type { ActorContext } from '$lib/models/identity';
import type { AttachmentId } from '$lib/models/attachments';
import type {
	Artifact,
	ArtifactId,
	DiagramRenders,
	ListArtifactsOutput,
	ListArtifactsParams,
	ExportSettings,
	ExtractedTemplateStyles,
	GenerateBundleInput,
	GenerateBundleOutput,
	GenerateDocumentInput,
	PreviewDocumentInput
} from '$lib/models/deliverables';
import type { DateTime } from '$lib/models/workspace';
import type { Note, NoteId, ProseMirrorDocument } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { Provenance } from '$lib/models/provenance';
import { MAX_BUNDLE_ENTRIES, defaultExportSettings } from '$lib/models/deliverables';
import { NotFoundError, ValidationError } from '$lib/errors';
import {
	attachmentIdFromSrc,
	fetchRemoteDataUrl,
	type ImageSourceResolver
} from '$lib/server/repositories/deliverables/export-images';
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
/** Mints a presigned download URL for an app-owned attachment, honoring the actor's access. */
interface AttachmentDownloader {
	downloadById(actor: ActorContext, attachmentId: AttachmentId): Promise<{ url: string }>;
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
	readonly imageResolver?: ImageSourceResolver;
}
interface GeneratePdfInput extends DiagramRenders {
	readonly notes: readonly { title: string; document: ProseMirrorDocument }[];
	readonly title: string;
	readonly styles?: ExtractedTemplateStyles;
	readonly settings?: ExportSettings;
	readonly imageResolver?: ImageSourceResolver;
}
interface BundleFile {
	readonly path: string;
	readonly bytes: Uint8Array;
}

/** Absent render maps are left off entirely, so the generators' own defaults stay in charge. */
const diagramRenders = (input: DiagramRenders): DiagramRenders => ({
	...(input.diagramSvgs ? { diagramSvgs: input.diagramSvgs } : {}),
	...(input.diagramPngs ? { diagramPngs: input.diagramPngs } : {}),
	...(input.diagramSizes ? { diagramSizes: input.diagramSizes } : {})
});

const now = (): DateTime => new Date().toISOString() as DateTime;

const mediaTypeFor = (format: 'docx' | 'pdf'): string =>
	format === 'docx'
		? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		: 'application/pdf';

const safeFilename = (title: string, extension: string): string =>
	`${title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'document'}.${extension}`;

const downloadFilename = (artifact: Artifact): string =>
	safeFilename(artifact.title, artifact.format);

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
		private readonly settingsRepo: ExportSettingsRepository,
		private readonly attachmentDownloader: AttachmentDownloader,
		private readonly zipPacker: (files: readonly BundleFile[]) => Buffer
	) {}

	/**
	 * Resolver the generators use for app-owned image URLs: an attachment id is swapped
	 * for a presigned download URL minted under the actor, then fetched as a data URL.
	 * Unreachable or non-embeddable attachments resolve to nothing, so the image degrades
	 * to a placeholder rather than failing the export.
	 */
	private imageResolver(actor: ActorContext): ImageSourceResolver {
		return async (src) => {
			const attachmentId = attachmentIdFromSrc(src);
			if (!attachmentId) return undefined;
			try {
				const { url } = await this.attachmentDownloader.downloadById(
					actor,
					attachmentId as AttachmentId
				);
				return await fetchRemoteDataUrl(url);
			} catch {
				return undefined;
			}
		};
	}

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
			imageResolver: this.imageResolver(actor),
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

	private async templateStyles(
		actor: ActorContext,
		templateId: GenerateDocumentInput['templateId']
	): Promise<ExtractedTemplateStyles | undefined> {
		if (!templateId) return undefined;
		const template = await this.templateRepo.findById(actor, templateId);
		if (!template?.extractedStyles) return undefined;
		return template.extractedStyles as unknown as ExtractedTemplateStyles;
	}

	/** The one place a format picks its generator, so every export path renders alike. */
	private async renderDocument(
		input: (GenerateDocxInput | GeneratePdfInput) & { readonly format: 'docx' | 'pdf' }
	): Promise<Buffer> {
		const { format, ...rest } = input;
		return format === 'docx' ? this.docxGenerator(rest) : this.pdfGenerator(rest);
	}

	/**
	 * One document per note, zipped.
	 *
	 * Nothing is persisted: no artifact row, no provenance. A bundle is a download rather
	 * than a tracked deliverable — `regenerate` could not reproduce one from a `format`
	 * alone, and a folder of thirty notes would bury the artifact library. The zip lands
	 * under `bundles/` so storage can expire it on its own schedule.
	 *
	 * Documents render one at a time: both generators are CPU-bound, and the entry cap is
	 * what keeps the worst case bounded rather than a concurrency limit.
	 */
	async generateBundle(
		actor: ActorContext,
		input: GenerateBundleInput
	): Promise<GenerateBundleOutput> {
		if (input.entries.length === 0) throw new ValidationError('Select at least one document.');
		if (input.entries.length > MAX_BUNDLE_ENTRIES) {
			throw new ValidationError(`Export up to ${MAX_BUNDLE_ENTRIES} documents at a time.`);
		}

		const settings = input.settings
			? validateSettings(input.settings)
			: await this.getSettings(actor, input.projectId);
		const extractedStyles = await this.templateStyles(actor, input.templateId);
		const imageResolver = this.imageResolver(actor);

		const files: BundleFile[] = [];
		for (const entry of input.entries) {
			const [note] = await this.loadNotes(actor, [entry.noteId]);
			if (!note) throw new NotFoundError(`Note ${entry.noteId} not found`);
			const bytes = await this.renderDocument({
				notes: [note],
				title: note.title,
				format: input.format,
				settings,
				...(extractedStyles ? { styles: extractedStyles } : {}),
				imageResolver,
				...diagramRenders(input)
			});
			files.push({ path: `${entry.path}.${input.format}`, bytes });
		}

		const buffer = this.zipPacker(files);
		const objectKey = `bundles/${actor.userId}/${randomUUID()}.zip`;
		await this.storage.put(objectKey, buffer, 'application/zip');
		const downloadUrl = await this.storage.createDownloadUrl(
			objectKey,
			3600,
			safeFilename(input.title, 'zip')
		);

		return { downloadUrl, fileCount: files.length, byteSize: buffer.length };
	}

	async generate(
		actor: ActorContext,
		input: GenerateDocumentInput
	): Promise<{ artifact: Artifact; downloadUrl: string }> {
		const notes = await this.loadNotes(actor, input.noteIds);
		const settings = input.settings
			? validateSettings(input.settings)
			: await this.getSettings(actor, input.projectId);

		const extractedStyles = await this.templateStyles(actor, input.templateId);
		const buffer = await this.renderDocument({
			notes,
			title: input.title,
			format: input.format,
			settings,
			...(extractedStyles ? { styles: extractedStyles } : {}),
			imageResolver: this.imageResolver(actor),
			...diagramRenders(input)
		});

		const artifactId = randomUUID() as ArtifactId;
		const objectKey = `artifacts/${actor.userId}/${artifactId}.${input.format}`;
		await this.storage.put(objectKey, buffer, mediaTypeFor(input.format));

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
