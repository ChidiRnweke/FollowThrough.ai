import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendEvalResult, buildEvalResultRecord } from './result-log';

const result = buildEvalResultRecord({
	runId: 'campaign-tool-retrieval-baseline',
	section: 'tool-retrieval',
	subjectModel: 'openai/gpt-5.6-luna',
	commit: 'abc123',
	profile: 'exploratory',
	caseId: 'tool-retrieval-todos-create',
	sample: 1,
	durationMs: 42,
	outcome: 'passed',
	completedAt: '2026-08-24T10:00:00.000Z'
});

const failedResult = buildEvalResultRecord({
	...result,
	caseId: 'tool-retrieval-todos-create-failed',
	outcome: 'failed',
	failure: 'The tool was not called'
});

const passedWithFailure = JSON.stringify([{ ...result, failure: 'Impossible passed state' }]);
const failedWithoutFailure = JSON.stringify([{ ...result, outcome: 'failed' }]);

describe('eval result log', () => {
	it('persists the provenance record', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'followthrough-result-log-'));
		const path = join(directory, 'results.json');
		try {
			await appendEvalResult(path, result);
			expect(JSON.parse(await readFile(path, 'utf8'))).toEqual([result]);
		} finally {
			await rm(directory, { recursive: true });
		}
	});

	it('round-trips a failed record with its required failure', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'followthrough-result-log-'));
		const path = join(directory, 'results.json');
		try {
			await appendEvalResult(path, failedResult);
			expect(JSON.parse(await readFile(path, 'utf8'))).toEqual([failedResult]);
		} finally {
			await rm(directory, { recursive: true });
		}
	});

	it('retains every record when cases finish concurrently', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'followthrough-result-log-'));
		const path = join(directory, 'results.json');
		const records = Array.from({ length: 24 }, (_, index) => ({
			...result,
			caseId: `concurrent-case-${index}`
		}));
		try {
			await Promise.all(records.map((record) => appendEvalResult(path, record)));
			expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(records);
		} finally {
			await rm(directory, { recursive: true });
		}
	});

	it('records the result and preserves a corrupt log as quarantined evidence', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'followthrough-result-log-'));
		const path = join(directory, 'results.json');
		try {
			await writeFile(path, '[{"caseId": "truncated"}]}\n]', 'utf8');
			await appendEvalResult(path, result);
			const quarantine = (await readdir(directory)).find((name) => name.includes('.corrupt-'));
			expect({
				results: JSON.parse(await readFile(path, 'utf8')),
				corruptCopy: quarantine ? await readFile(join(directory, quarantine), 'utf8') : undefined
			}).toEqual({
				results: [result],
				corruptCopy: '[{"caseId": "truncated"}]}\n]'
			});
		} finally {
			await rm(directory, { recursive: true });
		}
	});

	it('replaces structurally invalid JSON with the new result', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'followthrough-result-log-'));
		const path = join(directory, 'results.json');
		try {
			await writeFile(path, passedWithFailure, 'utf8');
			await appendEvalResult(path, result);
			expect(JSON.parse(await readFile(path, 'utf8'))).toEqual([result]);
		} finally {
			await rm(directory, { recursive: true });
		}
	});

	it('quarantines structurally invalid JSON as evidence', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'followthrough-result-log-'));
		const path = join(directory, 'results.json');
		try {
			await writeFile(path, failedWithoutFailure, 'utf8');
			await appendEvalResult(path, result);
			const quarantine = (await readdir(directory)).find((name) => name.includes('.corrupt-'))!;
			expect(await readFile(join(directory, quarantine), 'utf8')).toBe(failedWithoutFailure);
		} finally {
			await rm(directory, { recursive: true });
		}
	});
});
