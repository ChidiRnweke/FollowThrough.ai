import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
					"import type { Titles } from '$lib/services/notes/title'; export class Editor { constructor(private readonly titles: Titles) {} prepare(value: string): string { return this.titles.title(value); } }",
				'src/lib/services/notes/title.ts':
					'export interface Titles { title(value: string): string } export class TitleRules implements Titles { title(value: string): string { return value.trim(); } }',
				'src/lib/services/notes/title.spec.ts':
					"import { expect, it } from 'vitest'; import { TitleRules } from './title'; it('trims a title', () => { expect(new TitleRules().title(' note ')).toBe('note'); });"
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
	).not.toContain('structure:unknown-server-folder');
});
it('rejects controller operation injection without an implementation import', () => {
	expect(
		inspect({
			'src/lib/controllers/notes/title.ts':
				'export interface TitleController { present(value: string): string; }',
			'src/lib/controllers/notes/editor.ts':
				"import type { TitleController } from './title'; export class Editor { constructor(private readonly titles: TitleController) {} present(value: string): string { return this.titles.present(value); } }"
		})
	).toContain('import-boundary:banned-layer-import');
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

it('rejects type-only concrete controller dependencies', () => {
	expect(
		inspect({
			'src/lib/controllers/notes/title.ts':
				'export class Titles { present(value: string): string { return value; } }',
			'src/lib/controllers/notes/editor.ts':
				"import type { Titles } from './title'; export class Editor { constructor(private readonly titles: Titles) {} }"
		})
	).toContain('import-boundary:banned-layer-import');
});
it('rejects renamed controller contracts through an index barrel', () => {
	expect(
		inspect({
			'src/lib/controllers/notes/title.ts':
				'export interface Titles { present(value: string): string; }',
			'src/lib/controllers/notes/index.ts':
				"export type { Titles as TitleContract } from './title';",
			'src/lib/controllers/editor/editor.ts':
				"import type { TitleContract } from '../notes'; export class Editor { constructor(private readonly titles: TitleContract) {} }"
		})
	).toContain('import-boundary:banned-layer-import');
});
it('rejects controller class aliases through an index barrel', () => {
	expect(
		inspect({
			'src/lib/controllers/notes/title.ts':
				'export class Titles { present(value: string): string { return value; } }',
			'src/lib/controllers/notes/index.ts':
				"export type { Titles as TitleContract } from './title';",
			'src/lib/controllers/editor/editor.ts':
				"import type { TitleContract } from '../notes'; export class Editor { constructor(private readonly titles: TitleContract) {} }"
		})
	).toContain('import-boundary:banned-layer-import');
});

it('allows clients to forward controller-owned port interfaces', () => {
	expect(
		inspect({
			'src/lib/controllers/sync/cache.ts':
				'export interface Repository { load(): Promise<string>; } export interface Transport { read(): Promise<string>; }',
			'src/lib/client/sync/contracts.ts':
				"export type { Repository, Transport as ReadTransport } from '$lib/controllers/sync/cache';"
		})
	).not.toContain('import-boundary:banned-layer-import');
});
it('rejects clients forwarding concrete controller classes as types', () => {
	expect(
		inspect({
			'src/lib/controllers/sync/cache.ts':
				'export class Repository { async load(): Promise<string> { return "note"; } }',
			'src/lib/client/sync/contracts.ts':
				"export type { Repository as Port } from '$lib/controllers/sync/cache';"
		})
	).toContain('import-boundary:banned-layer-import');
});

// ADR 0007 closes the layer list: no server adapters or server stores exist to hold code.
it.each(['src/lib/server/adapters/notes/reader.ts', 'src/lib/server/stores/notes/cache.ts'])(
	'rejects server code in %s',
	(path) => {
		expect(inspect({ [path]: 'export const value = 1;' })).toContain(
			'structure:unknown-server-folder'
		);
	}
);
it('accepts the same code in a server service', () => {
	expect(
		inspect({
			'src/lib/server/services/notes/reader.ts':
				'export interface Reader { read(): number; } export class NoteReader implements Reader { read(): number { return 1; } }'
		})
	).not.toContain('structure:unknown-server-folder');
});

describe('browser layers mirror the server (ADR 0041)', () => {
	const repository =
		'export interface Drafts { read(): string } export class DraftRows implements Drafts { read() { return "draft"; } }';
	it('rejects a browser controller importing a browser repository', () => {
		expect(
			inspect({
				'src/lib/client/repositories/notes/drafts.ts': repository,
				'src/lib/controllers/notes/drafts.ts':
					"import { DraftRows } from '$lib/client/repositories/notes/drafts'; export const read = () => new DraftRows().read();"
			})
		).toContain('import-boundary:banned-layer-import');
	});
	it('lets a browser service call the remote function it owns', () => {
		expect(
			inspect({
				'src/lib/remote/notes/notes.remote.ts': 'export const readNote = async () => "note";',
				'src/lib/client/services/notes/reading.ts':
					"import { readNote } from '$lib/remote/notes/notes.remote'; export interface NoteReading { read(): Promise<string> } export class NoteReader implements NoteReading { read() { return readNote(); } }"
			})
		).not.toContain('import-boundary:banned-layer-import');
	});
	it('keeps shared services from calling remote functions', () => {
		expect(
			inspect({
				'src/lib/remote/notes/notes.remote.ts': 'export const readNote = async () => "note";',
				'src/lib/services/notes/reading.ts':
					"import { readNote } from '$lib/remote/notes/notes.remote'; export interface NoteReading { read(): Promise<string> } export class NoteReader implements NoteReading { read() { return readNote(); } }"
			})
		).toContain('import-boundary:banned-layer-import');
	});
});
