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
} from '$lib/repositories';
import {
	AttachmentParserRegistry,
	type AttachmentParser,
	type AttachmentStorage,
	type StoredObjectInfo
} from '$lib/server/domain/attachment-storage';
import { testActor, testNow, testProjectId } from '$lib/testing/fixtures/domain-builders';
import type { DocumentOcr, ImageDescriber, PdfSplitter } from './contracts';
import { AttachmentManagementService } from './management';

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

class StubStorage implements AttachmentStorage {
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

class StubPdfParser implements AttachmentParser {
	readonly kind = 'pdf';
	calls = 0;
	supports(mediaType: string): boolean {
		return mediaType === 'application/pdf';
	}
	async parse(): Promise<string> {
		this.calls += 1;
		return 'pdf-parse text';
	}
}

class StubDocumentOcr implements DocumentOcr {
	calls: { fileName: string; model: string }[] = [];
	failure?: Error;
	async parse(_bytes: Uint8Array, fileName: string, model: string): Promise<string> {
		this.calls.push({ fileName, model });
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

class StubPdfSplitter implements PdfSplitter {
	constructor(private readonly pages: number) {}
	async pageCount(): Promise<number> {
		return this.pages;
	}
	split(): Promise<Uint8Array[]> {
		throw new Error('not used');
	}
}

interface Harness {
	service: AttachmentManagementService;
	repository: StubAttachmentRepository;
	parser: StubPdfParser;
	ocr: StubDocumentOcr;
	describer: StubImageDescriber;
}

const setup = (pages = 5): Harness => {
	const repository = new StubAttachmentRepository();
	const parser = new StubPdfParser();
	const ocr = new StubDocumentOcr();
	const describer = new StubImageDescriber();
	const service = new AttachmentManagementService(
		repository,
		{} as NoteRepository,
		new StubStorage(),
		new AttachmentParserRegistry([parser]),
		undefined,
		undefined,
		undefined,
		ocr,
		describer,
		new StubPdfSplitter(pages)
	);
	return { service, repository, parser, ocr, describer };
};

/** process() is private and fire-and-forget in production; tests drive it directly. */
const process = (service: AttachmentManagementService, attachment: AttachmentView): Promise<void> =>
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
	it('stores OCR output with the ocr parser kind for PDFs under the page cap', async () => {
		const { service, repository, ocr } = setup(5);

		await process(service, view('application/pdf'));

		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'ocr',
			extractedText: 'ocr text',
			processingStatus: 'ready'
		});
		expect(ocr.calls).toEqual([{ fileName: 'doc.pdf', model: 'google/gemini-2.5-flash-lite' }]);
	});

	it('falls back to the plain parser when OCR fails', async () => {
		const { service, repository, parser, ocr } = setup(5);
		ocr.failure = new Error('OCR engine down');

		await process(service, view('application/pdf'));

		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'pdf',
			extractedText: 'pdf-parse text',
			processingStatus: 'ready'
		});
		expect(parser.calls).toBe(1);
	});

	it('uses the plain parser when OCR is disabled', async () => {
		vi.stubEnv('ATTACHMENT_OCR_ENABLED', 'false');
		const { service, repository, parser, ocr } = setup(5);

		await process(service, view('application/pdf'));

		expect(finalUpdate(repository).parserKind).toBe('pdf');
		expect(ocr.calls).toHaveLength(0);
		expect(parser.calls).toBe(1);
	});

	it('uses the plain parser for PDFs over the page cap', async () => {
		vi.stubEnv('ATTACHMENT_OCR_MAX_PAGES', '5');
		const { service, repository, ocr } = setup(6);

		await process(service, view('application/pdf'));

		expect(finalUpdate(repository).parserKind).toBe('pdf');
		expect(ocr.calls).toHaveLength(0);
	});
});

describe('attachment processing image branch', () => {
	it('describes images through the shared describer with the env-resolved model', async () => {
		vi.stubEnv('OPENROUTER_OCR_MODEL', 'openrouter/ocr-model');
		const { service, repository, describer } = setup();

		await process(service, view('image/png', 'chart.png'));

		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'vision',
			extractedText: 'a factual description',
			processingStatus: 'ready'
		});
		expect(describer.calls).toEqual([
			{ imageDataUrl: 'https://storage.test/presigned', model: 'openrouter/ocr-model' }
		]);
	});

	it('falls back to OPENROUTER_ATTACHMENT_VISION_MODEL when no OCR model is set', async () => {
		vi.stubEnv('OPENROUTER_ATTACHMENT_VISION_MODEL', 'openrouter/legacy-vision');
		const { service, describer } = setup();

		await process(service, view('image/png', 'chart.png'));

		expect(describer.calls[0].model).toBe('openrouter/legacy-vision');
	});
});
