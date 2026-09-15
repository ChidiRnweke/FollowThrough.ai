import { describe, expect, it } from 'vitest';
import { setupAttachments } from '$lib/testing/attachments/fixtures/processing';
import { view } from '$lib/testing/attachments/fakes/processing';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import type { AttachmentVersionId } from '$lib/models/attachments';

describe('durable attachment processing', () => {
	it('resumes a version interrupted by a worker restart', async () => {
		const { repository, worker } = setupAttachments();
		const queued = view('application/pdf');
		repository.found = {
			...queued,
			version: { ...queued.version, processingStatus: 'processing' }
		};
		await worker.run();
		expect(repository.found.version.processingStatus).toBe('ready');
	});
	it('leaves a claimed version for its current worker', async () => {
		const { repository, worker, claims } = setupAttachments();
		repository.found = view('application/pdf');
		await claims.withClaim(repository.found.version.id, () => worker.run());
		expect(repository.found.version.processingStatus).toBe('queued');
	});
	it('cannot save extraction results after losing the claim', async () => {
		const { repository, worker, claims, ocr } = setupAttachments();
		repository.found = view('application/pdf');
		const versionId = repository.found.version.id;
		ocr.beforeParse = async () => claims.lose(versionId);
		await worker.process(testActor(), versionId);
		expect(repository.found.version.processingStatus).toBe('processing');
	});
	it('does not stage search output after losing the claim', async () => {
		const { repository, worker, claims, ocr, search } = setupAttachments();
		repository.found = view('application/pdf');
		const versionId = repository.found.version.id;
		ocr.beforeParse = async () => claims.lose(versionId);
		await worker.process(testActor(), versionId);
		expect(search.documents).toEqual([]);
	});
	it('does not replace search output when an older version finishes', async () => {
		const { repository, worker, search } = setupAttachments();
		const old = view('application/pdf');
		repository.found = {
			...old,
			attachment: {
				...old.attachment,
				currentVersionId: crypto.randomUUID() as AttachmentVersionId
			}
		};
		await worker.run();
		expect(search.documents).toEqual([]);
	});
	it('stages literal search and leaves vectors in the embedding backlog', async () => {
		const { repository, worker, search } = setupAttachments();
		repository.found = view('application/pdf');
		await worker.run();
		expect(
			search.documents.map((item) => ({
				content: item.document.content,
				embedding: item.document.embedding
			}))
		).toEqual([{ content: 'ocr text', embedding: undefined }]);
	});
	it('resumes extraction after a lost owner releases the version', async () => {
		const { repository, worker, claims, ocr } = setupAttachments();
		repository.found = view('application/pdf');
		const versionId = repository.found.version.id;
		ocr.beforeParse = async () => claims.lose(versionId);
		await worker.process(testActor(), versionId);
		ocr.beforeParse = async () => {};
		await worker.run();
		expect(repository.found.version.processingStatus).toBe('ready');
	});
	it('keeps extraction pending when search staging cannot commit', async () => {
		const { repository, worker, search } = setupAttachments();
		repository.found = view('application/pdf');
		search.stageFailure = new Error('Search unavailable');
		await worker.process(testActor(), repository.found.version.id);
		expect(repository.found.version.processingStatus).toBe('processing');
	});
});
