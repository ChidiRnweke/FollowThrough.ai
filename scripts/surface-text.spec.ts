import { describe, expect, it } from 'vitest';
import { scanSurfaceText, surfaceTextUtilities } from './surface-text';

const scan = (source: string) => scanSurfaceText('example.svelte', source).findings;

describe('surface text inventory', () => {
	it('finds muted text on an ancestor accent wash', () => {
		expect(
			scan('<div class="bg-brand/10"><span class="text-muted-foreground">Caption</span></div>')
		).toMatchObject([{ surface: 'bg-brand/10', text: 'text-muted-foreground' }]);
	});
	it('keeps paired conditional recipes separate', () => {
		expect(
			scan(
				'<span class={overdue ? "bg-warning/15 text-warning" : "text-muted-foreground"}>Due</span>'
			)
		).toEqual([]);
	});
	it('resets the inherited surface at opaque neutral backgrounds', () => {
		expect(
			scan(
				'<div class="bg-brand/10"><div class="bg-card"><span class="text-muted-foreground">Caption</span></div></div>'
			)
		).toEqual([]);
	});
	it('keeps accent context through translucent neutral fills', () => {
		expect(
			scan(
				'<div class="bg-brand/10"><span class="bg-muted/50 text-muted-foreground">Caption</span></div>'
			)
		).toHaveLength(1);
	});
	it('does not report decorative empty elements', () => {
		expect(scan('<div class="bg-brand text-muted-foreground"></div>')).toEqual([]);
	});
	it('does not report full-strength foreground prose', () => {
		expect(scan('<p class="bg-brand/10 text-foreground">Prose</p>')).toEqual([]);
	});
	it('finds translucent text on colored surfaces', () => {
		expect(scan('<p class="bg-primary text-primary-foreground/60">Caption</p>')).toHaveLength(1);
	});
	it('respects a foreground override for the same hover state', () => {
		expect(
			scan('<p class="text-muted-foreground hover:bg-brand/10 hover:text-brand">Caption</p>')
		).toEqual([]);
	});
	it('identifies state-dependent candidates', () => {
		expect(scan('<p class="text-muted-foreground hover:bg-brand/10">Caption</p>')).toMatchObject([
			{ state: 'hover' }
		]);
	});
	it('walks conditional child fragments', () => {
		expect(
			scan(
				'<div class="bg-brand/10">{#if ready}<p class="text-muted-foreground">Ready</p>{/if}</div>'
			)
		).toHaveLength(1);
	});
	it('reports component uncertainty alongside source evidence', () => {
		expect(
			scan('<Button class="bg-brand/10 text-muted-foreground">Action</Button>')[0].unresolved
		).toContain('Component may override classes or render children through a portal.');
	});
	it('inventories TypeScript recipes without joining separate strings', () => {
		expect(
			scanSurfaceText(
				'recipe.ts',
				'const recipe = active ? "bg-brand/10 text-brand" : "text-muted-foreground";'
			).findings
		).toEqual([]);
	});
	it('reports TypeScript recipes as unresolved rendered candidates', () => {
		expect(
			scanSurfaceText('recipe.ts', 'const recipe = "bg-brand/10 text-muted-foreground";').findings
		).toMatchObject([{ kind: 'class-recipe' }]);
	});
	it('finds same-rule CSS semantic color mismatches', () => {
		expect(
			scanSurfaceText(
				'layout.css',
				'.notice { background-color: color-mix(in oklab, var(--color-brand) 10%, transparent); color: var(--muted-foreground); }'
			).findings
		).toHaveLength(1);
	});
});

describe('semantic text inventory', () => {
	it('resolves semantic caption utilities from the actual stylesheet', () => {
		expect(
			scanSurfaceText(
				'example.svelte',
				'<p class="bg-brand/10 provenance-caption">Caption</p>',
				surfaceTextUtilities('.provenance-caption { @apply text-xs text-muted-foreground; }')
			).findings
		).toHaveLength(1);
	});
	it('includes imported visible icon components', () => {
		expect(
			scan(
				'<script>import { FtArtifacts as Archive } from "$lib/components/icons";</script><div class="bg-brand/10"><Archive class="text-muted-foreground/60" /></div>'
			)
		).toHaveLength(1);
	});
	it('does not apply descendant selector colors to the parent text', () => {
		expect(
			scan('<p class="bg-brand/10 text-brand [&_svg]:text-muted-foreground">Caption</p>')
		).toEqual([]);
	});
});

describe('form and opacity inventory', () => {
	it('finds placeholder text against a focus wash in a module recipe', () => {
		expect(
			scan(
				'<script module>export const input = "bg-background placeholder:text-muted-foreground focus-visible:bg-brand/10";</script>'
			)
		).toMatchObject([
			{ kind: 'class-recipe', state: 'focus-visible:placeholder', text: 'text-muted-foreground' }
		]);
	});
	it('finds placeholder pairs on void input elements', () => {
		expect(
			scan('<input class="bg-brand/10 placeholder:text-muted-foreground" placeholder="Name" />')
		).toHaveLength(1);
	});
	it('honors an explicit focus placeholder color', () => {
		expect(
			scan(
				'<textarea class="bg-background placeholder:text-muted-foreground focus-visible:bg-brand/10 focus-visible:placeholder:text-brand-muted-foreground" />'
			)
		).toEqual([]);
	});
	it('reports opacity inherited from a colored ancestor', () => {
		expect(
			scan('<div class="bg-brand/10 opacity-50"><span class="text-foreground">Name</span></div>')[0]
				.text
		).toBe('text-foreground + opacity-50');
	});
	it('identifies disabled opacity separately', () => {
		expect(
			scan(
				'<button class="bg-primary text-primary-foreground disabled:opacity-50">Save</button>'
			)[0].unresolved
		).toContain(
			'Disabled-state opacity: intentional state treatment, review separately from ordinary text.'
		);
	});
	it('identifies reveal opacity separately', () => {
		expect(
			scan(
				'<button class="bg-primary text-primary-foreground opacity-0 group-hover:opacity-100">Close</button>'
			)[0].unresolved
		).toContain(
			'Reveal/visibility opacity: review only when visible and settled; do not treat hidden content as a legibility failure.'
		);
	});
	it('does not report a fully opaque foreground', () => {
		expect(scan('<p class="bg-brand/10 text-foreground opacity-100">Name</p>')).toEqual([]);
	});
});

describe('local class composition inventory', () => {
	it('finds inherited washes declared with Svelte class arrays', () => {
		expect(
			scan(
				'<div class={["card", lifted && "bg-primary/20"]}><span class="text-muted-foreground">Waiting</span></div>'
			)
		).toHaveLength(1);
	});
	it('resolves a same-file derived cn class binding', () => {
		expect(
			scan(
				'<script>const surface = $derived(cn("card", lifted && "bg-brand/10"));</script><div class={surface}><p class="text-muted-foreground">Caption</p></div>'
			)
		).toHaveLength(1);
	});
	it('preserves paired conditional colors inside class arrays', () => {
		expect(
			scan(
				'<p class={["caption", active ? "bg-brand/10 text-brand" : "text-muted-foreground"]}>Caption</p>'
			)
		).toEqual([]);
	});
	it('terminates cyclic class aliases without executing code', () => {
		expect(
			scan(
				'<script>const first = second; const second = first;</script><p class={first}>Caption</p>'
			)
		).toEqual([]);
	});
});
