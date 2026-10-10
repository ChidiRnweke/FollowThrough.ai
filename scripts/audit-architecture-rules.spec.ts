import { describe, expect, it } from 'vitest';
import { analyzeArchitecture } from './audit-architecture-rules';

const service = `export interface Titles { title(value: string): string }
export class TitleRules implements Titles { title(value: string): string { return value.trim(); } }`;
const servicePath = 'src/lib/services/notes/titles.ts';
const inspect = (files: Readonly<Record<string, string>>) => analyzeArchitecture(files);
const rules = (files: Readonly<Record<string, string>>) => [
	...new Set(inspect(files).map((item) => item.rule))
];

describe('public service capabilities', () => {
	it.each([
		'export function title(value: string) { return value.trim(); }',
		'export const title = (value: string) => value.trim();',
		'const title = (value: string) => value.trim(); export { title as clean };',
		'export default function(value: string) { return value.trim(); }',
		'export const rules = { title(value: string) { return value.trim(); } };'
	])('rejects public callable exports: %s', (source) => {
		expect(rules({ [servicePath]: source })).toEqual(['public-service-helper']);
	});
	it('rejects a helper exported through a barrel', () => {
		expect(
			rules({
				[servicePath]: "export { title } from '../../client/title';",
				'src/lib/client/title.ts': 'export const title = (value: string) => value.trim();'
			})
		).toEqual(['public-service-helper']);
	});
	it.each([
		'class Rules { title() {} } export { Rules };',
		'export default class { title() {} }',
		'export const Rules = class { title() {} };'
	])('requires contracts regardless of export spelling: %s', (source) => {
		expect(rules({ [servicePath]: source })).toContain('service-interface');
	});
	it('rejects public methods outside the contract', () => {
		expect(
			rules({
				[servicePath]: service.replace(
					'title(value: string): string {',
					'helper() {} title(value: string): string {'
				)
			})
		).toEqual(['public-service-helper']);
	});
	it('allows private helpers and meaningful implemented interfaces', () => {
		expect(
			inspect({
				[servicePath]: service.replace(
					'title(value: string): string {',
					'private helper() {} title(value: string): string {'
				)
			})
		).toEqual([]);
	});
});

describe('dependency provenance', () => {
	it.each([
		"import { TitleRules } from '$lib/services/notes/titles'; new TitleRules().title('x');",
		"import { TitleRules as Renamed } from '$lib/client/barrel'; new Renamed().title('x');",
		"import * as rules from '$lib/client/barrel'; new rules.TitleRules().title('x');",
		"import { title } from '$lib/client/wrapper'; title('x');"
	])('rejects component access through indirection: %s', (source) => {
		expect(
			rules({
				[servicePath]: service,
				'src/lib/components/note.ts': source,
				'src/lib/client/barrel.ts': "export * from '$lib/services/notes/titles';",
				'src/lib/client/wrapper.ts':
					"import { TitleRules } from './barrel'; export const title = (value: string) => new TitleRules().title(value);"
			})
		).toContain('indirect-dependency');
	});
	it('allows a controller to be the component operation boundary', () => {
		expect(
			inspect({
				[servicePath]: service,
				'src/lib/controllers/notes.ts':
					"import type { Titles } from '$lib/services/notes/titles'; export class Editor { constructor(private readonly titles: Titles) {} save() { return this.titles.title('note'); } }",
				'src/lib/components/note.ts':
					"import type { EditorOperation } from '$lib/controllers/contract'; declare const editor: EditorOperation; editor.save();",
				'src/lib/controllers/contract.ts': 'export interface EditorOperation { save(): string }'
			})
		).toEqual([]);
	});
	it('detects a service hidden behind a function port', () => {
		expect(
			rules({
				[servicePath]: service,
				'src/lib/services/notes/other.ts':
					'export interface Other { run(): string } export class OtherRules implements Other { constructor(private readonly clean: (v: string) => string) {} run() { return this.clean("note"); } }',
				'src/lib/factories/notes.ts':
					"import { TitleRules } from '$lib/services/notes/titles'; import { OtherRules, type Other } from '$lib/services/notes/other'; export function create(): Other { const titles = new TitleRules(); return new OtherRules(titles.title.bind(titles)); }"
			})
		).toContain('indirect-dependency');
	});
	it('resolves cyclic barrels without dropping a forbidden dependency', () => {
		expect(
			rules({
				[servicePath]: service,
				'src/lib/client/a.ts': "export * from './b'; export * from '$lib/services/notes/titles';",
				'src/lib/client/b.ts': "export * from './a';",
				'src/lib/components/note.ts':
					"import { TitleRules } from '$lib/client/b'; new TitleRules().title('x');"
			})
		).toContain('indirect-dependency');
	});
	it('reports unresolved project imports instead of claiming success', () => {
		expect(
			rules({
				'src/lib/components/note.ts': "import { title } from '$lib/client/missing'; title();"
			})
		).toEqual(['unresolved-source']);
	});
	it('preserves Svelte locations and resolved provenance', () => {
		const result = inspect({
			[servicePath]: service,
			'src/lib/components/note.svelte': `<h1>Note</h1>\n<script lang="ts">\nimport { TitleRules } from '$lib/services/notes/titles';\n</script>`
		});
		expect(result).toEqual([
			expect.objectContaining({
				file: 'src/lib/components/note.svelte',
				line: 3,
				rule: 'indirect-dependency',
				provenance: expect.arrayContaining([`${servicePath}:2`])
			})
		]);
	});
});

describe('concrete dependency surfaces', () => {
	it.each(['TitleRules', "Pick<TitleRules, 'title'>"])(
		'rejects concrete dependency type %s',
		(type) => {
			expect(
				rules({
					[servicePath]: service,
					'src/lib/controllers/notes.ts': `import type { TitleRules } from '$lib/services/notes/titles'; export class Editor { constructor(private readonly titles: ${type}) {} }`
				})
			).toContain('concrete-dependency');
		}
	);
	it('rejects an inferred concrete factory result', () => {
		expect(
			rules({
				[servicePath]: service,
				'src/lib/factories/notes.ts':
					"import { TitleRules } from '$lib/services/notes/titles'; export const create = () => ({ titles: new TitleRules() });"
			})
		).toEqual(['concrete-dependency']);
	});
	it('allows interface-typed factory bundles', () => {
		expect(
			inspect({
				[servicePath]: service,
				'src/lib/factories/notes.ts':
					"import { TitleRules, type Titles } from '$lib/services/notes/titles'; export const create = (): { titles: Titles } => ({ titles: new TitleRules() });"
			})
		).toEqual([]);
	});
	it('rejects a controller returning a service interface', () => {
		expect(
			rules({
				[servicePath]: service,
				'src/lib/controllers/notes.ts':
					"import type { Titles } from '$lib/services/notes/titles'; export interface Editor { rules(): Titles }"
			})
		).toEqual(['controller-collaborator']);
	});
});

describe('service lifetime', () => {
	it.each([
		'private count = 0;',
		'private readonly cache = new Map<string, string>();',
		'private static readonly pending = new Set<string>();'
	])('rejects retained state: %s', (field) => {
		expect(
			rules({
				[servicePath]: service.replace(
					'title(value: string): string {',
					`${field} title(value: string): string {`
				)
			})
		).toContain('retained-service-state');
	});
	it('rejects module caches', () => {
		expect(
			rules({ [servicePath]: `const cache = new Map<string, string>();\n${service}` })
		).toEqual(['retained-service-state']);
	});
	it('allows immutable config and readonly injected repository contracts', () => {
		expect(
			inspect({
				[servicePath]: service.replace(
					'title(value: string): string {',
					'constructor(private readonly repo: { read(): string }, private readonly prefix: string) {} private readonly config = { trim: true } as const; title(value: string): string {'
				)
			})
		).toEqual([]);
	});
	it('allows mutable evaluators created inside each operation', () => {
		expect(
			inspect({
				[servicePath]: `class Evaluator { private cache = new Map<string, string>(); evaluate(value: string) { this.cache.set(value, value); return value; } }\n${service.replace('return value.trim();', 'return new Evaluator().evaluate(value);')}`
			})
		).toEqual([]);
	});
});

describe('state and construction boundaries', () => {
	it.each(['stores', 'factories'])('rejects straight-line operations in %s', (owner) => {
		expect(
			rules({
				[servicePath]: service,
				[`src/lib/${owner}/notes.ts`]:
					"import type { Titles } from '$lib/services/notes/titles'; export function run(titles: Titles): string { return titles.title('note'); }"
			})
		).toContain(owner === 'stores' ? 'store-workflow' : 'factory-workflow');
	});
	it.each(['stores', 'factories'])('rejects workflow callbacks in %s', (owner) => {
		expect(
			rules({
				[servicePath]: service,
				[`src/lib/${owner}/notes.ts`]:
					"import type { Titles } from '$lib/services/notes/titles'; export function create(titles: Titles): () => string { const renamed = titles.title; return () => renamed('note'); }"
			})
		).toContain(owner === 'stores' ? 'store-workflow' : 'factory-workflow');
	});
	it('allows controlled store writes and state observers', () => {
		expect(
			inspect({
				'src/lib/stores/notes.ts':
					'export class State { private value = 0; private listeners = new Set<(value: number) => void>(); set(value: number): void { this.value = value; for (const listener of this.listeners) listener(value); } get(): number { return this.value; } }'
			})
		).toEqual([]);
	});
});

describe('symbol resolution edge cases', () => {
	it('rejects a default helper imported through two barrels', () => {
		expect(
			rules({
				'src/lib/services/rule.ts': 'export default (value: string) => value.trim();',
				'src/lib/client/a.ts': "export { default as clean } from '$lib/services/rule';",
				'src/lib/client/b.ts': "export { clean as normalize } from './a';",
				'src/lib/components/note.ts':
					"import { normalize } from '$lib/client/b'; normalize('note');"
			})
		).toContain('indirect-dependency');
	});
	it('rejects an injected callable object port supplied by another service', () => {
		expect(
			rules({
				[servicePath]: service,
				'src/lib/services/other.ts':
					'interface Input { clean(value: string): string } export interface Other { run(): string } export class OtherRules implements Other { constructor(private readonly input: Input) {} run() { return this.input.clean("note"); } }',
				'src/lib/factories/notes.ts':
					"import { TitleRules } from '$lib/services/notes/titles'; import { OtherRules, type Other } from '$lib/services/other'; export function create(): Other { const titles = new TitleRules(); return new OtherRules({ clean: value => titles.title(value) }); }"
			})
		).toContain('indirect-dependency');
	});
	it('allows a locally declared provider port without service provenance', () => {
		expect(
			inspect({
				[servicePath]: `interface Reader { read(value: string): string } ${service.replace('title(value: string): string {', 'constructor(private readonly reader: Reader) {} title(value: string): string {').replace('return value.trim();', 'return this.reader.read(value);')}`
			})
		).toEqual([]);
	});
	it('rejects aliased concrete types declared in a barrel', () => {
		expect(
			rules({
				[servicePath]: service,
				'src/lib/client/types.ts':
					"import type { TitleRules } from '$lib/services/notes/titles'; export type Hidden = Pick<TitleRules, 'title'>;",
				'src/lib/controllers/notes.ts':
					"import type { Hidden } from '$lib/client/types'; export class Editor { constructor(private readonly titles: Hidden) {} }"
			})
		).toContain('concrete-dependency');
	});
	it('allows utility types over domain records', () => {
		expect(
			inspect({
				'src/lib/models/notes.ts': 'export interface Note { title: string; body: string }',
				'src/lib/controllers/notes.ts':
					"import type { Note } from '$lib/models/notes'; export interface Editor { save(note: Pick<Note, 'title'>): void }"
			})
		).toEqual([]);
	});
	it('rejects nested collaborators returned from controller operations', () => {
		expect(
			rules({
				[servicePath]: service,
				'src/lib/controllers/notes.ts':
					"import type { Titles } from '$lib/services/notes/titles'; export interface Editor { open(): Promise<{ rules: Titles }> }"
			})
		).toContain('controller-collaborator');
	});
	it('allows readonly state views returned by controllers', () => {
		expect(
			inspect({
				'src/lib/stores/view.ts': 'export interface View { readonly title: string }',
				'src/lib/controllers/notes.ts':
					"import type { View } from '$lib/stores/view'; export interface Editor { view(): View }"
			})
		).toEqual([]);
	});
	it('rejects mutable store APIs returned by controllers', () => {
		expect(
			rules({
				'src/lib/stores/view.ts':
					'export interface State { title: string; setTitle(title: string): void }',
				'src/lib/controllers/notes.ts':
					"import type { State } from '$lib/stores/view'; export interface Editor { state(): State }"
			})
		).toContain('controller-collaborator');
	});
	it('rejects a retained constructor closure', () => {
		expect(
			rules({
				[servicePath]:
					'export interface Counter { next(): number } export class Counts implements Counter { readonly next: () => number; constructor() { let count = 0; this.next = () => ++count; } }'
			})
		).toContain('retained-service-state');
	});
	it('rejects mutated module objects', () => {
		expect(
			rules({
				[servicePath]: `const state = { count: 0 }; ${service.replace('return value.trim();', 'state.count++; return value.trim();')}`
			})
		).toContain('retained-service-state');
	});
	it('allows immutable literal lookup configuration', () => {
		expect(
			inspect({
				[servicePath]: `const extensions = new Set(['md', 'txt']); ${service.replace('return value.trim();', 'return extensions.has(value) ? value : "";')}`
			})
		).toEqual([]);
	});
	it('rejects a mutated literal lookup through an alias', () => {
		expect(
			rules({
				[servicePath]: `const extensions = new Set(['md', 'txt']); const alias = extensions; ${service.replace('return value.trim();', 'alias.add(value); return value;')}`
			})
		).toContain('retained-service-state');
	});
	it('allows readonly provider references selected from constructor options', () => {
		expect(
			inspect({
				[servicePath]: `interface Reader { read(): string } export interface Reading { read(): string } export class ReaderRules implements Reading { private readonly reader: Reader; constructor(options: { reader: Reader }) { this.reader = options.reader; } read() { return this.reader.read(); } }`
			})
		).toEqual([]);
	});
	it('allows stateless arrow methods on service contracts', () => {
		expect(
			inspect({
				[servicePath]:
					'export interface Titles { title(value: string): string } export class TitleRules implements Titles { readonly title = (value: string): string => value.trim(); }'
			})
		).toEqual([]);
	});
	it('allows factory construction of an adapter with deferred I/O', () => {
		expect(
			inspect({
				'src/lib/controllers/transport.ts': 'export interface Transport { send(): Promise<void> }',
				'src/lib/client/transport.ts':
					"import type { Transport } from '$lib/controllers/transport'; export const createTransport = (): Transport => ({ send: async () => { await fetch('/upload'); } });",
				'src/lib/factories/transport.ts':
					"import { createTransport } from '$lib/client/transport'; import type { Transport } from '$lib/controllers/transport'; export const create = (): Transport => createTransport();"
			})
		).toEqual([]);
	});
	it('rejects direct aliased transport calls from stores', () => {
		expect(
			rules({
				'src/lib/stores/notes.ts': "const send = fetch; export const save = () => send('/notes');"
			})
		).toContain('store-workflow');
	});
	it('checks both Svelte script blocks', () => {
		expect(
			rules({
				[servicePath]: service,
				'src/lib/components/note.svelte': `<script module lang="ts">import { TitleRules } from '$lib/services/notes/titles';</script><script lang="ts">let value = 'note';</script><p>{value}</p>`
			})
		).toContain('indirect-dependency');
	});
	it('resolves scriptless Svelte components without a false missing-module error', () => {
		expect(
			inspect({
				'src/lib/components/icon.svelte': '<svg><path d="M0 0" /></svg>',
				'src/lib/components/note.svelte':
					'<script>import Icon from "./icon.svelte";</script><Icon />'
			})
		).toEqual([]);
	});
	it('rejects malformed source instead of dropping it', () => {
		expect(rules({ 'src/lib/stores/notes.ts': 'export function broken( {' })).toContain(
			'unresolved-source'
		);
	});
});

it('rejects concrete classes hidden by interface inheritance', () => {
	expect(
		rules({
			[servicePath]: service,
			'src/lib/client/types.ts':
				"import type { TitleRules } from '$lib/services/notes/titles'; export interface Hidden extends TitleRules {}",
			'src/lib/controllers/notes.ts':
				"import type { Hidden } from '$lib/client/types'; export class Editor { constructor(private readonly titles: Hidden) {} }"
		})
	).toContain('concrete-dependency');
});
it('rejects concrete defaults on dependency parameters', () => {
	expect(
		rules({
			[servicePath]: service,
			'src/lib/controllers/notes.ts':
				"import { TitleRules } from '$lib/services/notes/titles'; export class Editor { constructor(private readonly titles = new TitleRules()) {} }"
		})
	).toContain('concrete-dependency');
});
it('rejects module-level closures retaining mutable state', () => {
	expect(
		rules({
			[servicePath]: `const next = (() => { let count = 0; return () => ++count; })(); ${service.replace('return value.trim();', 'return value + next();')}`
		})
	).toContain('retained-service-state');
});
it('rejects namespace service access used only in a Svelte template', () => {
	expect(
		rules({
			[servicePath]: service,
			'src/lib/client/barrel.ts': "export * from '$lib/services/notes/titles';",
			'src/lib/components/note.svelte': `<script lang="ts">import * as titles from '$lib/client/barrel';</script><p>{new titles.TitleRules().title('note')}</p>`
		})
	).toContain('indirect-dependency');
});
it('allows service methods to retain stateless bound operation objects', () => {
	expect(
		inspect({
			[servicePath]:
				'export interface Reading { readonly notes: { read(): string } } export class Reader implements Reading { readonly notes = { read: this.read.bind(this) }; private read() { return "note"; } }'
		})
	).toEqual([]);
});

it('rejects mutation of injected data retained by a service', () => {
	expect(
		rules({
			[servicePath]:
				'export interface Counter { next(): number } export class Counts implements Counter { constructor(private readonly config: { count: number }) {} next() { return this.config.count++; } }'
		})
	).toContain('retained-service-state');
});
it('rejects retained collection mutation through a field alias', () => {
	expect(
		rules({
			[servicePath]:
				'export interface Counter { next(): number } export class Counts implements Counter { private readonly cache = [1]; next() { const cache = this.cache; cache.push(1); return cache.length; } }'
		})
	).toContain('retained-service-state');
});
it('rejects collaborator getters on controller classes', () => {
	expect(
		rules({
			[servicePath]: service,
			'src/lib/controllers/notes.ts':
				"import type { Titles } from '$lib/services/notes/titles'; export class Editor { constructor(private readonly titles: Titles) {} get service() { return this.titles; } }"
		})
	).toContain('controller-collaborator');
});
it('rejects collaborator properties on controller contracts', () => {
	expect(
		rules({
			[servicePath]: service,
			'src/lib/controllers/notes.ts':
				"import type { Titles } from '$lib/services/notes/titles'; export interface Editor { readonly service: Titles }"
		})
	).toContain('controller-collaborator');
});
it('allows readonly state getters on controller classes', () => {
	expect(
		inspect({
			'src/lib/stores/view.ts': 'export interface View { readonly title: string }',
			'src/lib/controllers/notes.ts':
				"import type { View } from '$lib/stores/view'; export class Editor { constructor(private readonly state: View) {} get view(): View { return this.state; } }"
		})
	).toEqual([]);
});
it('rejects concrete factory singleton exports', () => {
	expect(
		rules({
			[servicePath]: service,
			'src/lib/factories/notes.ts':
				"import { TitleRules } from '$lib/services/notes/titles'; export const titles = new TitleRules();"
		})
	).toContain('concrete-dependency');
});
it('allows interface-typed factory singleton exports', () => {
	expect(
		inspect({
			[servicePath]: service,
			'src/lib/factories/notes.ts':
				"import { TitleRules, type Titles } from '$lib/services/notes/titles'; export const titles: Titles = new TitleRules();"
		})
	).toEqual([]);
});

it('allows controller constructor dependency bundles', () => {
	expect(
		inspect({
			[servicePath]: service,
			'src/lib/controllers/notes.ts':
				"import type { Titles } from '$lib/services/notes/titles'; export interface Dependencies { readonly titles: Titles } export class Editor { constructor(private readonly deps: Dependencies) {} save() { return this.deps.titles.title('note'); } }"
		})
	).toEqual([]);
});
it('allows a pure function collaborator wired by a factory', () => {
	expect(
		inspect({
			[servicePath]: service
				.replace(
					'title(value: string): string {',
					'constructor(private readonly format: (value: string) => string) {} title(value: string): string {'
				)
				.replace('return value.trim();', 'return this.format(value);'),
			'src/lib/factories/notes.ts':
				"import { TitleRules, type Titles } from '$lib/services/notes/titles'; export const create = (): Titles => new TitleRules(value => value.trim());"
		})
	).toEqual([]);
});

it('allows nested dependency interfaces consumed by controller construction', () => {
	expect(
		inspect({
			[servicePath]: service,
			'src/lib/controllers/notes.ts':
				"import type { Titles } from '$lib/services/notes/titles'; export interface Ports { readonly titles: Titles } export interface Dependencies { readonly ports: Ports } export class Editor { constructor(private readonly deps: Dependencies) {} save() { return this.deps.ports.titles.title('note'); } }"
		})
	).toEqual([]);
});

it('rejects nested callable service exports', () => {
	expect(
		rules({
			[servicePath]: 'export const helpers = { notes: { title: (value: string) => value.trim() } };'
		})
	).toEqual(['public-service-helper']);
});
it('rejects inherited public helpers outside the service contract', () => {
	expect(
		rules({
			[servicePath]:
				'class Base { helper() {} } export interface Titles { title(value: string): string } export class TitleRules extends Base implements Titles { title(value: string) { return value; } }'
		})
	).toContain('public-service-helper');
});
it('allows exported data without mistaking built-in methods for helpers', () => {
	expect(
		inspect({
			[servicePath]: `export const version = 'one'; export const labels = ['note', 'task'] as const; ${service}`
		})
	).toEqual([]);
});

it('keeps Svelte components distinct from same-named rune modules', () => {
	expect(
		rules({
			[servicePath]: service,
			'src/lib/components/note.svelte': `<script lang="ts">import { TitleRules } from '$lib/services/notes/titles';</script><p>Note</p>`,
			'src/lib/components/note.svelte.ts': 'export const label = "note";'
		})
	).toContain('indirect-dependency');
});
it('does not label server route handlers as components', () => {
	const result = inspect({
		[servicePath]: service,
		'src/routes/api/+server.ts':
			"import type { Titles } from '$lib/services/notes/titles'; export interface HandlerDependencies { titles: Titles }"
	});
	expect(result.filter((item) => item.message.startsWith('components '))).toEqual([]);
});
