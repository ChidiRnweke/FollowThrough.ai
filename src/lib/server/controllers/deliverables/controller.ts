import { NotFoundError, ValidationError } from '$lib/errors';
import { randomUUID } from 'node:crypto';
import {
	MAX_BUNDLE_ENTRIES,
	type ExportInput,
	type PreparedExport
} from '$lib/models/deliverables';
import type { AttachmentId } from '$lib/models/attachments';
import type { Note, NoteId } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import type { Provenance, ProvenanceRequest } from '$lib/models/provenance';
import {
	mediaTypeFor,
	safeFilename,
	validateSettings
} from '$lib/server/services/deliverables/artifacts';
import type {
	prepareExport,
	exportImageSources
} from '$lib/server/services/deliverables/export-preparation';
import { attachmentIdFromSrc } from '$lib/server/services/deliverables/export-preparation';
import type {
	DeliverableMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { SyncMutationTransactions } from '$lib/server/services/workspace/mutations';
import type { ActorContext } from '$lib/models/identity';
import type {
	Artifact,
	ArtifactId,
	ExportSettings,
	GenerateBundleInput,
	GenerateBundleOutput,
	GenerateDocumentInput,
	GenerateDocumentOutput,
	GetArtifactDownloadOutput,
	ListArtifactsOutput,
	ListArtifactsParams,
	PreviewDocumentInput,
	PreviewDocumentOutput,
	TemplateId
} from '$lib/models/deliverables';
import type { ProjectId, ProjectTemplate, TemplateUpload } from '$lib/models/projects';
import type {
	ArtifactDeleter,
	ArtifactLister,
	ArtifactReader,
	ExportSettingsReader,
	ExportSettingsWriter
} from '$lib/server/services/deliverables/artifact-contracts';
import type { DocumentTemplates } from '$lib/server/services/deliverables/templates';
import type { verifiedTemplateStyles } from '$lib/server/services/deliverables/template-styles';
import type { IAttachmentStorage } from '$lib/server/services/attachments/storage';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';

/**
 * Application boundary for deliverables: document templates, generated artifacts, and
 * per-project export settings.
 *
 * Template uploads are two-phase (initiate then complete) so an abandoned upload never
 * leaves a partial template behind. Generated artifact metadata and provenance commit together.
 */
export interface DeliverablesController {
	synchronize(
		actor: ActorContext,
		input: DeliverableMutationRequest
	): Promise<WorkspaceMutationResult>;
	/**
	 * Begin a template upload: reserve a template record and return a presigned URL the
	 * client writes the file to. The template becomes visible only after
	 * {@link completeTemplateUpload}.
	 */
	initiateTemplateUpload(
		actor: ActorContext,
		input: {
			projectId: ProjectId;
			name: string;
			mediaType: string;
			byteSize: number;
			checksumSha256: string;
		}
	): Promise<{
		templateId: TemplateId;
		uploadUrl: string;
		requiredHeaders: Record<string, string>;
	}>;
	/** Finalize a completed template upload and make the template usable for generation. */
	completeTemplateUpload(actor: ActorContext, templateId: TemplateId): Promise<void>;
	/** List the templates available to a project, in display order. */
	listTemplates(actor: ActorContext, projectId: ProjectId): Promise<readonly ProjectTemplate[]>;
	/** Permanently remove a template. */
	deleteTemplate(actor: ActorContext, templateId: TemplateId): Promise<void>;
	/**
	 * Generate a finished document artifact from a template and note content.
	 *
	 * Render and upload before committing artifact metadata and provenance together.
	 * Remove the new upload if signing or persistence fails.
	 */
	generateDocument(
		actor: ActorContext,
		input: GenerateDocumentInput
	): Promise<GenerateDocumentOutput>;
	/**
	 * Generate one document per note and return them zipped.
	 *
	 * Store an ephemeral zip without artifact metadata or provenance. The zip does not
	 * appear in the artifact library.
	 */
	generateBundle(actor: ActorContext, input: GenerateBundleInput): Promise<GenerateBundleOutput>;
	/**
	 * Render a document for preview without persisting it, returning the rendered bytes
	 * as base64 so the client can show them immediately. Intentionally side-effect free.
	 */
	previewDocument(actor: ActorContext, input: PreviewDocumentInput): Promise<PreviewDocumentOutput>;
	/** Read the export settings saved for a project. */
	getExportSettings(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings>;
	/** Persist the export settings for a project and return them as stored. */
	updateExportSettings(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings>;
	/** List the generated artifacts in a project, with paging/filtering params. */
	listArtifacts(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListArtifactsParams
	): Promise<ListArtifactsOutput>;
	/** Fetch an artifact's metadata, or `undefined` when it does not exist. */
	getArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<Artifact | undefined>;
	/** Return a presigned URL that streams an artifact's file bytes. */
	downloadArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<GetArtifactDownloadOutput>;
	/** Permanently delete an artifact. */
	deleteArtifact(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<Pick<Artifact, 'id' | 'title'>>;
	/**
	 * Create a new artifact from the existing source identities and current note/settings
	 * state. Preserve the original artifact and its stored content.
	 */
	regenerateArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<GenerateDocumentOutput>;
}

/** Everything the {@link DeliverablesController} needs, injected so it can be built and tested without real stores. */
export interface DeliverablesDependencies {
	syncMutations: Pick<SyncMutationTransactions, 'run'>;
	templates: DocumentTemplates;
	templateStorage: IAttachmentStorage;
	templateStyles: typeof verifiedTemplateStyles;
	noteReader: { get(actor: ActorContext, id: NoteId): Promise<Note> };
	provenanceRecorder: {
		record(actor: ActorContext, input: ProvenanceRequest): Promise<Provenance>;
	};
	artifactWriter: { store(actor: ActorContext, artifact: Artifact): Promise<Artifact> };
	artifactStorage: IAttachmentStorage;
	attachmentDownloader: {
		downloadById(actor: ActorContext, id: AttachmentId): Promise<{ url: string }>;
	};
	fetchImage: (url: string) => Promise<string | undefined>;
	prepareExport: typeof prepareExport;
	exportImageSources: typeof exportImageSources;
	docxGenerator: (input: PreparedExport) => Promise<Buffer>;
	pdfGenerator: (input: PreparedExport) => Promise<Buffer>;
	zipPacker: (files: readonly { path: string; bytes: Uint8Array }[]) => Buffer;
	exportSettingsReader: ExportSettingsReader;
	exportSettingsWriter: ExportSettingsWriter;
	artifactLister: ArtifactLister;
	artifactReader: ArtifactReader;
	artifactDeleter: ArtifactDeleter;
	transactionRunner: TransactionRunner;
}

export class Deliverables implements DeliverablesController {
	synchronize(
		actor: ActorContext,
		input: DeliverableMutationRequest
	): Promise<WorkspaceMutationResult> {
		return this.dependencies.syncMutations.run(actor, input, async () => {
			const command = input.command;
			if (command.userId !== actor.userId)
				throw new ValidationError('The export settings belong to another account');
			await this.updateExportSettings(actor, command.projectId, command.settings);
		});
	}
	constructor(private readonly dependencies: DeliverablesDependencies) {}

	async initiateTemplateUpload(
		actor: ActorContext,
		input: {
			projectId: ProjectId;
			name: string;
			mediaType: string;
			byteSize: number;
			checksumSha256: string;
		}
	) {
		const upload = await this.dependencies.templates.reserveUpload(actor, input);
		const uploadUrl = await this.dependencies.templateStorage.createUploadUrl({
			objectKey: upload.objectKey,
			mediaType: upload.mediaType,
			byteSize: upload.byteSize,
			checksumSha256: upload.checksumSha256,
			expiresInSeconds: 600
		});
		return {
			templateId: upload.id,
			uploadUrl,
			requiredHeaders: {
				'content-type': upload.mediaType,
				'x-amz-meta-sha256': upload.checksumSha256
			}
		};
	}

	async completeTemplateUpload(actor: ActorContext, templateId: TemplateId): Promise<void> {
		const {
			templates,
			templateStorage: storage,
			templateStyles,
			transactionRunner
		} = this.dependencies;
		const stagingKey = `staging/${actor.userId}/templates/${templateId}`;
		if (await templates.find(actor, templateId)) {
			await storage.remove(stagingKey);
			return;
		}
		let upload: TemplateUpload;
		let bytes: Uint8Array;
		try {
			upload = await templates.upload(actor, templateId);
			bytes = await storage.read(upload.objectKey, upload.byteSize);
		} catch (error) {
			// Another completion may remove the reservation or staging after our initial read.
			if (await templates.find(actor, templateId)) {
				await storage.remove(stagingKey);
				return;
			}
			throw error;
		}
		const styles = await templateStyles(upload, bytes);
		const destination = `projects/${upload.projectId}/templates/${templateId}`;
		// Write the exact bytes verified above. A signed staging URL may still accept writes.
		await storage.put(destination, bytes, upload.mediaType);
		await transactionRunner.run(async () => {
			const locked = await templates.lockUpload(actor, templateId);
			if (await templates.find(actor, templateId)) return;
			if (!locked) throw new NotFoundError('Template upload no longer exists');
			await templates.store(actor, locked, destination, styles);
			await templates.finishUpload(actor, templateId);
		});
		await storage.remove(stagingKey);
	}

	async listTemplates(actor: ActorContext, projectId: ProjectId) {
		return this.dependencies.templates.list(actor, projectId);
	}

	async deleteTemplate(actor: ActorContext, templateId: TemplateId): Promise<void> {
		await this.dependencies.templates.delete(actor, templateId);
	}

	async generateDocument(
		actor: ActorContext,
		input: GenerateDocumentInput
	): Promise<GenerateDocumentOutput> {
		const prepared = await this.prepareDocument(actor, input);
		const buffer = await this.renderDocument(input.format, prepared);
		const id = randomUUID() as ArtifactId;
		const objectKey = `artifacts/${actor.userId}/${id}.${input.format}`;
		const storage = this.dependencies.artifactStorage;
		await storage.put(objectKey, buffer, mediaTypeFor(input.format));
		try {
			const downloadUrl = await storage.createDownloadUrl(
				objectKey,
				3600,
				safeFilename(input.title, input.format)
			);
			const artifact = await this.dependencies.transactionRunner.run(async () => {
				const provenance = await this.dependencies.provenanceRecorder.record(actor, {
					producerKind: 'user',
					producerName: 'document-export',
					metadata: {}
				});
				return this.dependencies.artifactWriter.store(actor, {
					id,
					userId: actor.userId,
					projectId: input.projectId,
					title: input.title,
					format: input.format,
					objectKey,
					byteSize: buffer.length,
					sourceNoteIds: input.noteIds,
					templateId: input.templateId,
					provenanceId: provenance.id,
					...('runId' in provenance ? { runId: provenance.runId } : {}),
					createdAt: new Date().toISOString() as DateTime
				});
			});
			return { artifact, downloadUrl };
		} catch (error) {
			try {
				await storage.remove(objectKey);
			} catch (cleanupError) {
				throw new AggregateError(
					[error, cleanupError],
					'Export failed and its uploaded file could not be removed',
					{ cause: cleanupError }
				);
			}
			throw error;
		}
	}

	private async prepareDocument(
		actor: ActorContext,
		input: PreviewDocumentInput & { templateId?: TemplateId }
	): Promise<PreparedExport> {
		const notes = await Promise.all(
			input.noteIds.map(async (id) => {
				const note = await this.dependencies.noteReader.get(actor, id);
				return { title: note.title, document: note.document };
			})
		);
		const settings = input.settings
			? validateSettings(input.settings)
			: await this.getExportSettings(actor, input.projectId);
		const styles = input.templateId
			? await this.dependencies.templates.styles(actor, input.templateId, input.projectId)
			: undefined;
		const images = new Map<string, string>();
		for (const source of new Set(
			notes.flatMap((note) => this.dependencies.exportImageSources(note.document))
		)) {
			const attachmentId = attachmentIdFromSrc(source);
			if (!attachmentId) continue;
			const { url } = await this.dependencies.attachmentDownloader.downloadById(
				actor,
				attachmentId as AttachmentId
			);
			const image = await this.dependencies.fetchImage(url);
			if (image) images.set(source, image);
		}
		const exportInput: ExportInput = {
			...input,
			notes,
			settings,
			images,
			...(styles ? { styles } : {})
		};
		return this.dependencies.prepareExport(exportInput);
	}

	private renderDocument(format: 'pdf' | 'docx', input: PreparedExport): Promise<Buffer> {
		return format === 'pdf'
			? this.dependencies.pdfGenerator(input)
			: this.dependencies.docxGenerator(input);
	}

	async generateBundle(
		actor: ActorContext,
		input: GenerateBundleInput
	): Promise<GenerateBundleOutput> {
		if (!input.entries.length) throw new ValidationError('Select at least one document.');
		if (input.entries.length > MAX_BUNDLE_ENTRIES)
			throw new ValidationError(`Export up to ${MAX_BUNDLE_ENTRIES} documents at a time.`);
		const files: { path: string; bytes: Uint8Array }[] = [];
		for (const entry of input.entries) {
			const prepared = await this.prepareDocument(actor, { ...input, noteIds: [entry.noteId] });
			const note = prepared.notes[0];
			if (!note) throw new NotFoundError(`Note ${entry.noteId} not found`);
			const bytes = await this.renderDocument(input.format, { ...prepared, title: note.title });
			files.push({ path: `${entry.path}.${input.format}`, bytes });
		}
		const buffer = this.dependencies.zipPacker(files);
		const objectKey = `bundles/${actor.userId}/${randomUUID()}.zip`;
		await this.dependencies.artifactStorage.put(objectKey, buffer, 'application/zip');
		try {
			const downloadUrl = await this.dependencies.artifactStorage.createDownloadUrl(
				objectKey,
				3600,
				safeFilename(input.title, 'zip')
			);
			return { downloadUrl, fileCount: files.length, byteSize: buffer.length };
		} catch (error) {
			try {
				await this.dependencies.artifactStorage.remove(objectKey);
			} catch (cleanupError) {
				throw new AggregateError(
					[error, cleanupError],
					'Bundle export failed and its uploaded file could not be removed',
					{ cause: cleanupError }
				);
			}
			throw error;
		}
	}

	async previewDocument(
		actor: ActorContext,
		input: PreviewDocumentInput
	): Promise<PreviewDocumentOutput> {
		const buffer = await this.dependencies.pdfGenerator(await this.prepareDocument(actor, input));
		return { data: buffer.toString('base64') };
	}

	async getExportSettings(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings> {
		return this.dependencies.exportSettingsReader.getSettings(actor, projectId);
	}

	async updateExportSettings(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings> {
		return this.dependencies.exportSettingsWriter.updateSettings(actor, projectId, settings);
	}

	async listArtifacts(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListArtifactsParams
	): Promise<ListArtifactsOutput> {
		return this.dependencies.artifactLister.list(actor, projectId, params);
	}

	async getArtifact(actor: ActorContext, artifactId: ArtifactId) {
		return this.dependencies.artifactReader.get(actor, artifactId);
	}

	async downloadArtifact(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<GetArtifactDownloadOutput> {
		const artifact = await this.getArtifact(actor, artifactId);
		if (!artifact) throw new NotFoundError('Artifact not found');
		return {
			url: await this.dependencies.artifactStorage.createDownloadUrl(
				artifact.objectKey,
				3600,
				safeFilename(artifact.title, artifact.format)
			)
		};
	}

	async deleteArtifact(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<Pick<Artifact, 'id' | 'title'>> {
		return this.dependencies.artifactDeleter.delete(actor, artifactId);
	}

	async regenerateArtifact(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<GenerateDocumentOutput> {
		const existing = await this.getArtifact(actor, artifactId);
		if (!existing) throw new NotFoundError('Artifact not found');
		return this.generateDocument(actor, {
			projectId: existing.projectId,
			noteIds: existing.sourceNoteIds,
			title: existing.title,
			format: existing.format,
			templateId: existing.templateId
		});
	}
}
