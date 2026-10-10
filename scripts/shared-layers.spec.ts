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
	it('rejects a browser store initiating controller work', () => {
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
		).toContain('import-boundary:banned-layer-import');
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

it('lets a controller update its explicit server state store', () => {
	expect(
		inspect({
			'src/lib/server/stores/agent/runs.ts':
				'export class Runs { private count = 0; increment(): void { this.count += 1; } }',
			'src/lib/server/controllers/agent/controller.ts':
				"import type { Runs } from '$lib/server/stores/agent/runs'; export class Agent { constructor(private readonly state: Runs) {} start(): void { this.state.increment(); } }"
		})
	).toEqual([]);
});

it('keeps services from reaching explicit server state stores', () => {
	expect(
		inspect({
			'src/lib/server/stores/agent/runs.ts':
				'export class Runs { private count = 0; increment(): void { this.count += 1; } }',
			'src/lib/server/services/agent/runs.ts':
				"import type { Runs } from '$lib/server/stores/agent/runs'; export class RunRules { constructor(private readonly state: Runs) {} start(): void { this.state.increment(); } }"
		})
	).toContain('import-boundary:banned-layer-import');
});

it('classifies SDK adapters and lets factories construct them', () => {
	expect(
		inspect({
			'src/lib/server/adapters/tokenization/codec.ts':
				'export class Codec { count(value: string): number { return value.length; } }',
			'src/lib/server/codec-factory.ts':
				"import { Codec } from '$lib/server/adapters/tokenization/codec'; export const createCodec = () => new Codec();"
		})
	).toEqual([]);
});

it('keeps domain workflows out of SDK adapters', () => {
	expect(
		inspect({
			'src/lib/server/controllers/notes/controller.ts': 'export const save = () => 1;',
			'src/lib/server/adapters/tokenization/codec.ts':
				"import { save } from '$lib/server/controllers/notes/controller'; export class Codec { count(): number { return save(); } }"
		})
	).toContain('import-boundary:banned-layer-import');
});

it('requires services to receive adapters through interfaces instead of constructing SDK clients', () => {
	expect(
		inspect({
			'src/lib/server/adapters/tokenization/codec.ts':
				'export class Codec { count(value: string): number { return value.length; } }',
			'src/lib/server/services/notes/title.ts':
				"import { Codec } from '$lib/server/adapters/tokenization/codec'; export const count = (value: string) => new Codec().count(value);"
		})
	).toContain('import-boundary:banned-layer-import');
});

it('lets browser components construct an interface-typed controller capability', () => {
	expect(
		inspect({
			'src/lib/components/notes/title.ts':
				"import { createTitle } from '$lib/factories/notes/title'; export const controller = createTitle();",
			'src/lib/factories/notes/title.ts':
				"import { NoteTitles, type TitleController } from '$lib/controllers/notes/title'; export const createTitle = (): TitleController => new NoteTitles();",
			'src/lib/controllers/notes/title.ts':
				'export interface TitleController { present(value: string): string; } export class NoteTitles implements TitleController { present(value: string): string { return value; } }'
		})
	).toEqual([]);
});
it('lets a coordinator receive another operation contract without importing its implementation', () => {
	expect(
		inspect({
			'src/lib/controllers/notes/title.ts':
				'export interface TitleController { present(value: string): string; }',
			'src/lib/controllers/notes/editor.ts':
				"import type { TitleController } from './title'; export class Editor { constructor(private readonly titles: TitleController) {} present(value: string): string { return this.titles.present(value); } }"
		})
	).toEqual([]);
});
it('keeps controller implementation construction inside factories', () => {
	expect(
		inspect({
			'src/lib/controllers/notes/title.ts':
				'export class NoteTitles { present(value: string): string { return value; } }',
			'src/lib/controllers/notes/editor.ts':
				"import { NoteTitles } from './title'; export class Editor { private readonly titles = new NoteTitles(); }"
		})
	).toContain('import-boundary:banned-layer-import');
});
it('rejects component access to shared services', () => {
	expect(
		inspect({
			'src/lib/components/notes/title.ts':
				"import { TitleService } from '$lib/services/notes/title'; export const title = new TitleService().present('Draft');",
			'src/lib/services/notes/title.ts':
				'export interface ITitleService { present(value: string): string; } export class TitleService implements ITitleService { present(value: string): string { return value; } }'
		})
	).toContain('import-boundary:banned-layer-import');
});
it('rejects business rules hidden in browser transport wrappers', () => {
	expect(
		inspect({
			'src/lib/client/notes/title.ts':
				"import { TitleService } from '$lib/services/notes/title'; export const title = new TitleService().present('Draft');",
			'src/lib/services/notes/title.ts':
				'export interface ITitleService { present(value: string): string; } export class TitleService implements ITitleService { present(value: string): string { return value; } }'
		})
	).toContain('import-boundary:banned-layer-import');
});
it('classifies shared write-input readers as boundary adapters', () => {
	expect(
		inspect({
			'src/lib/adapters/widgets/candidate-reader.ts':
				'export class Reader { read(value: string): string { return value; } }',
			'src/lib/factories/widgets/editing.ts':
				"import { Reader } from '$lib/adapters/widgets/candidate-reader'; export const createReader = () => new Reader();"
		})
	).toEqual([]);
});
it('keeps shared input adapters from executing services', () => {
	expect(
		inspect({
			'src/lib/adapters/widgets/candidate-reader.ts':
				"import { TitleService } from '$lib/services/notes/title'; export const read = new TitleService();",
			'src/lib/services/notes/title.ts':
				'export interface ITitleService { present(value: string): string; } export class TitleService implements ITitleService { present(value: string): string { return value; } }'
		})
	).toContain('import-boundary:banned-layer-import');
});

it('accepts explicit capability names without imposing class-derived interface names', () => {
	expect(
		inspect({
			'src/lib/services/notes/reading.ts':
				'export interface NoteReader { read(): string; } export class NoteReadingService implements NoteReader { read(): string { return "note"; } }'
		})
	).not.toContain('structural:missing-service-interface');
});
it('rejects a matching interface that the service never implements', () => {
	expect(
		inspect({
			'src/lib/services/notes/reading.ts':
				'export interface INoteReadingService { read(): string; } export class NoteReadingService { read(): string { return "note"; } }'
		})
	).toContain('structural:missing-service-interface');
});
it('checks public service classes whose names do not end in Service', () => {
	expect(
		inspect({
			'src/lib/services/notes/reading.ts':
				'export class NoteReading { read(): string { return "note"; } }'
		})
	).toContain('structural:missing-service-interface');
});
it('does not treat implementing another class as an interface contract', () => {
	expect(
		inspect({
			'src/lib/services/notes/reading.ts':
				'class ReadingBase { read(): string { return "note"; } } export class NoteReading implements ReadingBase { read(): string { return "note"; } }'
		})
	).toContain('structural:missing-service-interface');
});
it('leaves operation-private evaluators private to the service implementation', () => {
	expect(
		inspect({
			'src/lib/services/notes/reading.ts':
				'class Evaluator { readonly parts: string[] = []; } export interface NoteReader { read(): string; } export class NoteReading implements NoteReader { read(): string { const evaluator = new Evaluator(); evaluator.parts.push("note"); return evaluator.parts.join(""); } }'
		})
	).not.toContain('structural:missing-service-interface');
});
