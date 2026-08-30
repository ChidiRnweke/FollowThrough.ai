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

describe('eval result log', () => {
	it('retains all provenance fields', () => {
		expect(result).toEqual({
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
	});

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

	it('records the result rather than failing the case when the log is corrupt', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'followthrough-result-log-'));
		const path = join(directory, 'results.json');
		try {
			await writeFile(path, '[{"caseId": "truncated"}]}\n]', 'utf8');
			await appendEvalResult(path, result);
			expect(JSON.parse(await readFile(path, 'utf8'))).toEqual([result]);
		} finally {
			await rm(directory, { recursive: true });
		}
	});

	it('keeps the unreadable log as evidence rather than overwriting it', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'followthrough-result-log-'));
		const path = join(directory, 'results.json');
		try {
			await writeFile(path, '[{"caseId": "truncated"}]}\n]', 'utf8');
			await appendEvalResult(path, result);
			expect((await readdir(directory)).some((name) => name.includes('.corrupt-'))).toBe(true);
		} finally {
			await rm(directory, { recursive: true });
		}
	});
});
