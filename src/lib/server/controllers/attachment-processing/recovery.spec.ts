import { describe, expect, it } from 'vitest';
import { setupAttachments } from '$lib/testing/attachments/fixtures/processing';
import { view } from '$lib/testing/attachments/fakes/processing';
import type { AttachmentVersionId } from '$lib/models/attachments';

describe('durable attachment processing', () => {
	it('resumes a version interrupted by a worker restart', async () => {
		const { repository, worker } = setupAttachments();
		const queued = view('application/pdf');
		repository.found = {
			...queued,
			version: { ...queued.version, processingStatus: 'processing' }
		};
		await worker.process(repository.found.version.id);
		expect(repository.found.version.processingStatus).toBe('ready');
	});
	it('leaves a claimed version for its current worker', async () => {
		const { repository, worker, claims } = setupAttachments();
		repository.found = view('application/pdf');
		const versionId = repository.found.version.id;
		await claims.withClaim(versionId, () => worker.process(versionId));
		expect(repository.found.version.processingStatus).toBe('queued');
	});
	it('does not save extraction or search results after losing the claim', async () => {
		const { repository, worker, claims, extraction, search } = setupAttachments();
		repository.found = view('application/pdf');
		const versionId = repository.found.version.id;
		extraction.beforeExtract = async () => claims.lose(versionId);
		await worker.process(versionId);
		expect(repository.found.version.processingStatus).toBe('processing');
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
		await worker.process(repository.found.version.id);
		expect(search.documents).toEqual([]);
	});
	it('stages literal search and leaves vectors in the embedding backlog', async () => {
		const { repository, worker, search } = setupAttachments();
		repository.found = view('application/pdf');
		await worker.process(repository.found.version.id);
		expect(
			search.documents.map((item) => ({
				content: item.document.content,
				embedding: item.document.embedding
			}))
		).toEqual([{ content: 'ocr text', embedding: undefined }]);
	});
	it('resumes extraction after a lost owner releases the version', async () => {
		const { repository, worker, claims, extraction } = setupAttachments();
		repository.found = view('application/pdf');
		const versionId = repository.found.version.id;
		extraction.beforeExtract = async () => claims.lose(versionId);
		await worker.process(versionId);
		extraction.beforeExtract = async () => {};
		await worker.process(repository.found.version.id);
		expect(repository.found.version.processingStatus).toBe('ready');
	});
	it('keeps extraction pending when search staging cannot commit', async () => {
		const { repository, worker, search } = setupAttachments();
		repository.found = view('application/pdf');
		search.stageFailure = new Error('Search unavailable');
		await worker.process(repository.found.version.id);
		expect(repository.found.version.processingStatus).toBe('processing');
	});
});
