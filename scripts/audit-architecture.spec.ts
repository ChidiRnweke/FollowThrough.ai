import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { z } from 'zod';

const report = z.object({
	violations: z.array(z.object({ file: z.string(), line: z.number(), rule: z.string() }))
});
const audit = (source: string) => {
	const directory = mkdtempSync(join(tmpdir(), 'followthrough-semantic-cli-'));
	try {
		mkdirSync(join(directory, 'src/lib/services'), { recursive: true });
		writeFileSync(join(directory, 'src/lib/services/titles.ts'), source);
		writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({ include: ['src/**/*.ts'] }));
		const result = spawnSync(
			process.execPath,
			[resolve('scripts/audit-architecture.ts'), `--root=${directory}`, '--json'],
			{ encoding: 'utf8' }
		);
		if (result.error) throw result.error;
		return { status: result.status, ...report.parse(JSON.parse(result.stdout)) };
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

it('fails the CLI with a source location for public service helpers', () => {
	expect(audit('export const title = (value: string) => value.trim();')).toEqual({
		status: 1,
		violations: [{ file: 'src/lib/services/titles.ts', line: 1, rule: 'public-service-helper' }]
	});
});
it('passes the CLI for a stateless capability with an explicit interface', () => {
	expect(
		audit(
			'export interface Titles { title(value: string): string } export class TitleRules implements Titles { title(value: string) { return value.trim(); } }'
		)
	).toEqual({ status: 0, violations: [] });
});
it('fails the CLI when a local dependency cannot be resolved', () => {
	expect(
		audit(
			"import type { Missing } from './missing'; export interface Titles { title(value: Missing): string }"
		)
	).toEqual({
		status: 1,
		violations: [{ file: 'src/lib/services/titles.ts', line: 1, rule: 'unresolved-source' }]
	});
});
