import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '$lib/models/identity';
import type {
	AttachmentId,
	AttachmentUpload,
	AttachmentUploadId,
	AttachmentVersion,
	AttachmentVersionId,
	AttachmentView
} from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import type {
	AttachmentRepository,
	OwnedAttachmentUpload
} from '$lib/server/repositories/attachments/attachments';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import {
	AttachmentParserRegistry,
	type AttachmentParser,
	type IAttachmentStorage,
	type StoredObjectInfo
} from '$lib/server/services/attachments/storage';
import {
	noteBuilder,
	testActor,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { DocumentOcr, ImageDescriber, OcrParseInput } from './content';
import { AttachmentLibrary } from './library';

const ATTACHMENT_ID = '00000000-0000-4000-8000-0000000000a1' as AttachmentId;
const VERSION_ID = '00000000-0000-4000-8000-0000000000b1' as AttachmentVersionId;
const UPLOAD_ID = '00000000-0000-4000-8000-0000000000c1' as AttachmentUploadId;
const UPLOAD_BYTES = 128;
const UPLOAD_CHECKSUM = 'a'.repeat(64);

/** A pasted image: an upload that names the note it was dropped into. */
const uploadFor = (noteId: NoteId): AttachmentUpload => ({
	id: UPLOAD_ID,
	projectId: testProjectId(),
	noteId,
	path: 'pasted-diagram.png',
	objectKey: 'uploads/pasted-diagram.png',
	mediaType: 'image/png',
	byteSize: UPLOAD_BYTES,
	checksumSha256: UPLOAD_CHECKSUM,
	expiresAt: new Date(Date.now() + 60_000).toISOString() as DateTime,
	createdAt: testNow
});

const view = (mediaType: string, path = 'doc.pdf'): AttachmentView => ({
	attachment: {
		id: ATTACHMENT_ID,
		projectId: testProjectId(),
		path,
		currentVersionId: VERSION_ID,
		createdAt: testNow,
		updatedAt: testNow
	},
	version: {
		id: VERSION_ID,
		attachmentId: ATTACHMENT_ID,
		objectKey: 'objects/doc',
		mediaType,
		byteSize: 128,
		checksumSha256: 'a'.repeat(64),
		processingStatus: 'queued',
		createdAt: testNow
	}
});

class StubAttachmentRepository implements AttachmentRepository {
	readonly updates: AttachmentVersion[] = [];
	readonly removed: string[] = [];
	/** Set by the tests that drive `complete()`; the rest never look one up. */
	upload?: AttachmentUpload;

	private viewOf(version: AttachmentVersion): AttachmentView {
		return { attachment: view('application/pdf').attachment, version };
	}

	createUpload(): Promise<AttachmentUpload> {
		throw new Error('not used');
	}
	async findUpload(): Promise<AttachmentUpload | undefined> {
		if (!this.upload) throw new Error('not used');
		return this.upload;
	}
	deleteUpload(): Promise<void> {
		throw new Error('not used');
	}
	listExpiredUploads(): Promise<readonly OwnedAttachmentUpload[]> {
		throw new Error('not used');
	}
	list(): Promise<readonly AttachmentView[]> {
		throw new Error('not used');
	}
	listForProject(): Promise<readonly AttachmentView[]> {
		throw new Error('not used');
	}
	linkToTodo(): Promise<void> {
		throw new Error('not used');
	}
	listForTodo(): Promise<readonly AttachmentView[]> {
		throw new Error('not used');
	}
	findById(): Promise<AttachmentView | undefined> {
		throw new Error('not used');
	}
	async findByPath(): Promise<AttachmentView | undefined> {
		return undefined;
	}
	async finalize(
		_actor: ActorContext,
		_upload: AttachmentUpload,
		version: AttachmentVersion
	): Promise<AttachmentView> {
		return this.viewOf(version);
	}
	async remove(_actor: ActorContext, _noteId: NoteId, path: string): Promise<void> {
		this.removed.push(path);
	}
	removeById(): Promise<void> {
		throw new Error('not used');
	}
	async updateVersion(_actor: ActorContext, version: AttachmentVersion): Promise<AttachmentView> {
		this.updates.push(version);
		return this.viewOf(version);
	}
	async failInterrupted(): Promise<number> {
		return 0;
	}
}

class StubStorage implements IAttachmentStorage {
	createUploadUrl(): Promise<string> {
		throw new Error('not used');
	}
	async createDownloadUrl(): Promise<string> {
		return 'https://storage.test/presigned';
	}
	put(): Promise<void> {
		throw new Error('not used');
	}
	async stat(): Promise<StoredObjectInfo> {
		return { byteSize: UPLOAD_BYTES, checksumSha256: UPLOAD_CHECKSUM };
	}
	async read(): Promise<Uint8Array> {
		return new Uint8Array([1, 2, 3]);
	}
	async promote(): Promise<void> {}
	remove(): Promise<void> {
		throw new Error('not used');
	}
}

class StubTextParser implements AttachmentParser {
	readonly kind = 'text';
	calls = 0;
	supports(mediaType: string, path: string): boolean {
		return mediaType.startsWith('text/') || path.endsWith('.md');
	}
	async parse(): Promise<string> {
		this.calls += 1;
		return 'decoded text';
	}
}

class StubDocumentOcr implements DocumentOcr {
	calls: OcrParseInput[] = [];
	failure?: Error;
	async parse(input: OcrParseInput): Promise<string> {
		this.calls.push(input);
		if (this.failure) throw this.failure;
		return 'ocr text';
	}
}

class StubImageDescriber implements ImageDescriber {
	calls: { imageDataUrl: string; model: string }[] = [];
	async describe(input: { imageDataUrl: string; model: string }): Promise<string> {
		this.calls.push(input);
		return 'a factual description';
	}
}

interface Harness {
	service: AttachmentLibrary;
	repository: StubAttachmentRepository;
	notes: InMemoryNoteRepository;
	textParser: StubTextParser;
	ocr: StubDocumentOcr;
	describer: StubImageDescriber;
}

const setup = (): Harness => {
	const repository = new StubAttachmentRepository();
	const notes = new InMemoryNoteRepository();
	const textParser = new StubTextParser();
	const ocr = new StubDocumentOcr();
	const describer = new StubImageDescriber();
	const service = new AttachmentLibrary(
		repository,
		notes,
		new StubStorage(),
		new AttachmentParserRegistry([textParser]),
		ocr,
		describer
	);
	return { service, repository, notes, textParser, ocr, describer };
};

/** process() is private and fire-and-forget in production; tests drive it directly. */
const process = (service: AttachmentLibrary, attachment: AttachmentView): Promise<void> =>
	(
		service as unknown as {
			process(actor: ActorContext, target: AttachmentView): Promise<void>;
		}
	).process(testActor(), attachment);

const finalUpdate = (repository: StubAttachmentRepository): AttachmentVersion => {
	const final = repository.updates.at(-1);
	if (!final) throw new Error('process() recorded no version update');
	return final;
};

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('attachments and the note document revision', () => {
	// `currentRevision` is the document's optimistic-concurrency token. The editor
	// holds it open while a pasted image uploads, so a bump here surfaced to the
	// user as a conflict dialog on a note only they had touched.
	it('leaves the revision alone when an upload completes, so an open editor stays current', async () => {
		const { service, repository, notes } = setup();
		const note = noteBuilder({ currentRevision: 7 });
		notes.notes.push(note);
		repository.upload = uploadFor(note.id);

		await service.complete(testActor(), UPLOAD_ID);

		expect((await notes.findById(testActor(), note.id))?.currentRevision).toBe(7);
	});

	it('writes no note revision snapshot for a completed upload', async () => {
		const { service, repository, notes } = setup();
		const note = noteBuilder();
		notes.notes.push(note);
		repository.upload = uploadFor(note.id);

		await service.complete(testActor(), UPLOAD_ID);

		expect(notes.revisions).toEqual([]);
	});

	it('leaves the revision alone when an attachment is removed', async () => {
		const { service, notes } = setup();
		const note = noteBuilder({ currentRevision: 7 });
		notes.notes.push(note);

		await service.remove(testActor(), note.id, 'pasted-diagram.png');

		expect((await notes.findById(testActor(), note.id))?.currentRevision).toBe(7);
	});
});

describe('attachment processing OCR routing', () => {
	it('stores OCR output with the ocr parser kind for PDFs', async () => {
		const { service, repository } = setup();

		await process(service, view('application/pdf'));

		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'ocr',
			extractedText: 'ocr text',
			processingStatus: 'ready'
		});
	});

	it('hands the engine a presigned url rather than bytes', async () => {
		const { service, ocr } = setup();

		await process(service, view('application/pdf'));

		expect(ocr.calls[0]).toMatchObject({
			documentUrl: 'https://storage.test/presigned',
			kind: 'document',
			fileName: 'doc.pdf'
		});
	});

	it('passes the configured page cap to the engine', async () => {
		vi.stubEnv('ATTACHMENT_OCR_MAX_PAGES', '25');
		const { service, ocr } = setup();

		await process(service, view('application/pdf'));

		expect(ocr.calls[0].maxPages).toBe(25);
	});

	it('sends office documents to OCR instead of reporting them unsupported (1/2)', async () => {
		const { service, repository, ocr: _ocr } = setup();

		await process(service, view('application/octet-stream', 'report.docx'));

		expect(finalUpdate(repository).parserKind).toBe('ocr');
	});

	it('sends office documents to OCR instead of reporting them unsupported (2/2)', async () => {
		const { service, repository: _repository, ocr } = setup();

		await process(service, view('application/octet-stream', 'report.docx'));
		expect(ocr.calls[0].kind).toBe('document');
	});

	it('decodes text-ish files locally rather than spending an OCR call (1/3)', async () => {
		const { service, repository, textParser: _textParser, ocr: _ocr } = setup();

		await process(service, view('text/markdown', 'notes.md'));

		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'text',
			extractedText: 'decoded text'
		});
	});

	it('decodes text-ish files locally rather than spending an OCR call (2/3)', async () => {
		const { service, repository: _repository, textParser, ocr: _ocr } = setup();

		await process(service, view('text/markdown', 'notes.md'));
		expect(textParser.calls).toBe(1);
	});

	it('decodes text-ish files locally rather than spending an OCR call (3/3)', async () => {
		const { service, repository: _repository, textParser: _textParser, ocr } = setup();

		await process(service, view('text/markdown', 'notes.md'));
		expect(ocr.calls).toHaveLength(0);
	});

	it('records the attachment as failed when OCR fails, so it can be retried', async () => {
		const { service, repository, ocr } = setup();
		ocr.failure = new Error('OCR engine down');

		await process(service, view('application/pdf'));

		expect(finalUpdate(repository)).toMatchObject({
			processingStatus: 'failed',
			processingFailure: 'OCR engine down'
		});
	});

	it('reports a format the engine does not accept as unsupported (1/2)', async () => {
		const { service, repository, ocr: _ocr } = setup();

		await process(service, view('application/zip', 'bundle.zip'));

		expect(finalUpdate(repository).processingStatus).toBe('unsupported');
	});

	it('reports a format the engine does not accept as unsupported (2/2)', async () => {
		const { service, repository: _repository, ocr } = setup();

		await process(service, view('application/zip', 'bundle.zip'));
		expect(ocr.calls).toHaveLength(0);
	});
});

describe('attachment processing image branch', () => {
	it('sends images to OCR as an image', async () => {
		const { service, ocr } = setup();

		await process(service, view('image/png', 'chart.png'));

		expect(ocr.calls[0]).toMatchObject({ kind: 'image', fileName: 'chart.png' });
	});

	it('keeps the vision description alongside text recovered from an image', async () => {
		const { service, repository } = setup();

		await process(service, view('image/png', 'chart.png'));

		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'ocr',
			extractedText: 'ocr text\n\n> **Image:** a factual description'
		});
	});

	it('describes an image from its presigned url', async () => {
		const { service, describer } = setup();

		await process(service, view('image/png', 'chart.png'));

		expect(describer.calls).toEqual([
			{ imageDataUrl: 'https://storage.test/presigned', model: 'google/gemini-2.5-flash-lite' }
		]);
	});

	it('keeps the OCR text when the description fails', async () => {
		const { service, repository, describer } = setup();
		describer.describe = async () => {
			throw new Error('Vision unavailable');
		};

		await process(service, view('image/png', 'chart.png'));

		expect(finalUpdate(repository).extractedText).toBe('ocr text');
	});

	it('resolves the vision model from OPENROUTER_ATTACHMENT_VISION_MODEL', async () => {
		vi.stubEnv('OPENROUTER_ATTACHMENT_VISION_MODEL', 'openrouter/vision');
		const { service, describer } = setup();

		await process(service, view('image/png', 'chart.png'));

		expect(describer.calls[0].model).toBe('openrouter/vision');
	});
});
