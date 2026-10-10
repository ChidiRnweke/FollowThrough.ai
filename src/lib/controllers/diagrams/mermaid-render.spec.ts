import { expect, it } from 'vitest';
import { MermaidRenderSession } from './mermaid-render';
import { MermaidDiagrams } from './mermaid';
import { MermaidRenderStore } from '$lib/stores/diagrams/mermaid-render.svelte';
import { MermaidThemeService } from '$lib/services/diagrams/mermaid-theme';
import { InMemoryMermaidRenderer } from '$lib/testing/diagrams/fakes/mermaid-render';
import { InMemoryMermaidOutput } from '$lib/testing/diagrams/fakes/mermaid-output';
const setup = () => {
	const renderer = new InMemoryMermaidRenderer();
	const controller = new MermaidRenderSession(
		new MermaidRenderStore(),
		new MermaidDiagrams(new MermaidThemeService(), renderer, new InMemoryMermaidOutput())
	);
	return { renderer, controller };
};
it('keeps the newer drawing when an earlier render finishes last', async () => {
	const { renderer, controller } = setup();
	const first = controller.draw('first', false);
	const second = controller.draw('second', true);
	renderer.complete('second', '<svg>second</svg>');
	await second;
	renderer.complete('first', '<svg>first</svg>');
	await first;
	expect(controller.current).toEqual({ kind: 'ready', svg: '<svg>second</svg>' });
});
it('does not adopt a drawing after its surface closes', async () => {
	const { renderer, controller } = setup();
	const drawing = controller.draw('first', false);
	controller.cancel();
	renderer.complete('first', '<svg>first</svg>');
	await drawing;
	expect(controller.current).toEqual({ kind: 'pending' });
});
it('reports invalid syntax without retaining a previous drawing', async () => {
	const { renderer, controller } = setup();
	const drawing = controller.draw('invalid', false);
	renderer.fail('invalid');
	await drawing;
	expect(controller.current).toEqual({ kind: 'failure' });
});
it('does not replace a newer drawing with an old failure', async () => {
	const { renderer, controller } = setup();
	const first = controller.draw('first', false);
	const second = controller.draw('second', true);
	renderer.complete('second', '<svg>second</svg>');
	await second;
	renderer.fail('first');
	await first;
	expect(controller.current).toEqual({ kind: 'ready', svg: '<svg>second</svg>' });
});
