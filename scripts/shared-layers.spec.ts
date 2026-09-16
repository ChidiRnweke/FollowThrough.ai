import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const reportSchema = z.object({
	violations: z.array(z.object({ ruleId: z.string() }))
});

const inspect = (files: Readonly<Record<string, string>>): readonly string[] => {
	const root = mkdtempSync(join(tmpdir(), 'followthrough-shared-layers-'));
	try {
		const project = {
			'package.json': JSON.stringify({ name: 'layer-fixture', type: 'module' }),
			'chisel.config.json': JSON.stringify({
				mode: 'sveltekit-standalone',
				tsconfig: 'tsconfig.json'
			}),
			'tsconfig.json': JSON.stringify({
				compilerOptions: { baseUrl: '.', paths: { '$lib/*': ['src/lib/*'] } },
				include: ['src/**/*.ts']
			}),
			...files
		};
		for (const [file, source] of Object.entries(project)) {
			const path = join(root, file);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, source);
		}
		const run = spawnSync(
			process.execPath,
			[resolve('node_modules/@chidirnweke/chisel-js/dist/main.js'), 'check', root, '--json'],
			{ encoding: 'utf8' }
		);
		if (run.error) throw run.error;
		return reportSchema.parse(JSON.parse(run.stdout)).violations.map((item) => item.ruleId);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
};

describe('Shared service and controller placement', () => {
	it('classifies server-only upload readers as transport boundary helpers', () => {
		expect(
			inspect({
				'src/lib/remote/notes/archive-reader.server.ts':
					'export const read = (bytes: Uint8Array) => bytes.length;'
			})
		).toEqual([]);
	});
	it('keeps services from importing upload boundary readers', () => {
		expect(
			inspect({
				'src/lib/remote/notes/archive-reader.server.ts':
					'export const read = (bytes: Uint8Array) => bytes.length;',
				'src/lib/server/services/notes/import.ts':
					"import { read } from '$lib/remote/notes/archive-reader.server'; export const parse = read;"
			})
		).toContain('import-boundary:banned-layer-import');
	});
	it('allows a browser store to call a shared controller and its shared service', () => {
		expect(
			inspect({
				'src/lib/stores/note.ts':
					"import { prepare } from '$lib/controllers/notes/prepare'; export const result = prepare('note');",
				'src/lib/controllers/notes/prepare.ts':
					"import { title } from '$lib/services/notes/title'; export const prepare = (value: string) => title(value);",
				'src/lib/services/notes/title.ts': 'export const title = (value: string) => value.trim();',
				'src/lib/services/notes/title.spec.ts':
					"import { expect, it } from 'vitest'; import { title } from './title'; it('trims a title', () => { expect(title(' note ')).toBe('note'); });"
			})
		).toEqual([]);
	});
	it('allows a server controller to use the same shared service', () => {
		expect(
			inspect({
				'src/lib/server/controllers/notes/controller.ts':
					"import { title } from '$lib/services/notes/title'; export const prepare = (value: string) => title(value);",
				'src/lib/services/notes/title.ts': 'export const title = (value: string) => value.trim();',
				'src/lib/services/notes/title.spec.ts':
					"import { expect, it } from 'vitest'; import { title } from './title'; it('trims a title', () => { expect(title(' note ')).toBe('note'); });"
			})
		).toEqual([]);
	});
	it('keeps shared service-to-service calls forbidden', () => {
		expect(
			inspect({
				'src/lib/services/notes/title.ts':
					"import { other } from '$lib/services/projects/name'; export const title = other;",
				'src/lib/services/projects/name.ts': 'export const other = (value: string) => value.trim();'
			})
		).toContain('import-boundary:banned-layer-import');
	});
	it('does not let a server service hide a shared service dependency', () => {
		expect(
			inspect({
				'src/lib/server/services/notes/catalog.ts':
					"import { title } from '$lib/services/notes/title'; export const prepare = title;",
				'src/lib/services/notes/title.ts': 'export const title = (value: string) => value.trim();'
			})
		).toContain('import-boundary:banned-layer-import');
	});
	it('rejects server storage leaking through a shared service', () => {
		expect(
			inspect({
				'src/lib/services/notes/title.ts':
					"import { read } from '$lib/server/repositories/notes/records'; export const title = read;",
				'src/lib/server/repositories/notes/records.ts': "export const read = () => 'private';"
			})
		).toContain('server-layer-leak:client-reachable-import');
	});
	it('keeps model dependencies on services forbidden', () => {
		expect(
			inspect({
				'src/lib/models/notes/index.ts':
					"import { title } from '$lib/services/notes/title'; export const value = title('note');",
				'src/lib/services/notes/title.ts': 'export const title = (value: string) => value.trim();'
			})
		).toContain('import-boundary:layer-no-internal-imports');
	});
});
