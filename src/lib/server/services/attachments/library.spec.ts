import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
	ActorContext,
	AttachmentId,
	AttachmentUpload,
	AttachmentVersion,
	AttachmentVersionId,
	AttachmentView
} from '$lib/models';
import type {
	AttachmentRepository,
	NoteRepository,
	OwnedAttachmentUpload
} from '$lib/server/repositories';
import {
	AttachmentParserRegistry,
	type AttachmentParser,
	type IAttachmentStorage,
	type StoredObjectInfo
} from '$lib/server/services/attachments/storage';
import { testActor, testNow, testProjectId } from '$lib/testing/fixtures/domain-builders';
import type { DocumentOcr, ImageDescriber, OcrParseInput } from './content';
import { AttachmentLibrary } from './library';

const ATTACHMENT_ID = '00000000-0000-4000-8000-0000000000a1' as AttachmentId;
const VERSION_ID = '00000000-0000-4000-8000-0000000000b1' as AttachmentVersionId;

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

	private viewOf(version: AttachmentVersion): AttachmentView {
		return { attachment: view('application/pdf').attachment, version };
	}

	createUpload(): Promise<AttachmentUpload> {
		throw new Error('not used');
	}
	findUpload(): Promise<AttachmentUpload | undefined> {
		throw new Error('not used');
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
	findById(): Promise<AttachmentView | undefined> {
		throw new Error('not used');
	}
	findByPath(): Promise<AttachmentView | undefined> {
		throw new Error('not used');
	}
	finalize(): Promise<AttachmentView> {
		throw new Error('not used');
	}
	remove(): Promise<void> {
		throw new Error('not used');
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
	stat(): Promise<StoredObjectInfo> {
		throw new Error('not used');
	}
	async read(): Promise<Uint8Array> {
		return new Uint8Array([1, 2, 3]);
	}
	promote(): Promise<void> {
		throw new Error('not used');
	}
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
	textParser: StubTextParser;
	ocr: StubDocumentOcr;
	describer: StubImageDescriber;
}

const setup = (): Harness => {
	const repository = new StubAttachmentRepository();
	const textParser = new StubTextParser();
	const ocr = new StubDocumentOcr();
	const describer = new StubImageDescriber();
	const service = new AttachmentLibrary(
		repository,
		{} as NoteRepository,
		new StubStorage(),
		new AttachmentParserRegistry([textParser]),
		ocr,
		describer
	);
	return { service, repository, textParser, ocr, describer };
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

	it('sends office documents to OCR instead of reporting them unsupported', async () => {
		const { service, repository, ocr } = setup();

		await process(service, view('application/octet-stream', 'report.docx'));

		expect(finalUpdate(repository).parserKind).toBe('ocr');
		expect(ocr.calls[0].kind).toBe('document');
	});

	it('decodes text-ish files locally rather than spending an OCR call', async () => {
		const { service, repository, textParser, ocr } = setup();

		await process(service, view('text/markdown', 'notes.md'));

		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'text',
			extractedText: 'decoded text'
		});
		expect(textParser.calls).toBe(1);
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

	it('reports a format the engine does not accept as unsupported', async () => {
		const { service, repository, ocr } = setup();

		await process(service, view('application/zip', 'bundle.zip'));

		expect(finalUpdate(repository).processingStatus).toBe('unsupported');
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
