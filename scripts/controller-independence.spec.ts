import { expect, it } from 'vitest';
import { controllerImportViolations } from './controller-independence';

it('rejects a type-only controller dependency through a barrel', () => {
	const files = new Map([
		['src/lib/controllers/notes/workspace.ts', "import type { Draft } from '$lib/models/draft';"],
		[
			'src/lib/models/draft/index.ts',
			"export type { Draft } from '$lib/controllers/workspace/draft';"
		],
		['src/lib/controllers/workspace/draft.ts', 'export interface Draft { save(): Promise<void>; }']
	]);
	expect(controllerImportViolations(files)).toEqual([
		'src/lib/controllers/notes/workspace.ts:1 imports another controller (src/lib/controllers/workspace/draft.ts)'
	]);
});
it('rejects a relative controller import', () => {
	expect(
		controllerImportViolations(
			new Map([
				['src/lib/controllers/notes/workspace.ts', "import { Editor } from './editor';"],
				['src/lib/controllers/notes/editor.ts', 'export class Editor {}']
			])
		)
	).toEqual([
		'src/lib/controllers/notes/workspace.ts:1 imports another controller (src/lib/controllers/notes/editor.ts)'
	]);
});
it('rejects dynamic controller imports', () => {
	expect(
		controllerImportViolations(
			new Map([
				['src/lib/controllers/notes/workspace.ts', "const editor = import('./editor');"],
				['src/lib/controllers/notes/editor.ts', 'export class Editor {}']
			])
		)
	).toEqual([
		'src/lib/controllers/notes/workspace.ts:1 imports another controller (src/lib/controllers/notes/editor.ts)'
	]);
});
it('allows independent controllers to use raw contracts and shared rules', () => {
	expect(
		controllerImportViolations(
			new Map([
				[
					'src/lib/controllers/notes/workspace.ts',
					"import type { Storage } from '$lib/models/storage'; import type { Editing } from '$lib/services/notes/editing';"
				],
				[
					'src/lib/models/storage/index.ts',
					'export interface Storage { read(): Promise<string>; }'
				],
				[
					'src/lib/services/notes/editing.ts',
					'export interface Editing { title(value: string): string; }'
				]
			])
		)
	).toEqual([]);
});
