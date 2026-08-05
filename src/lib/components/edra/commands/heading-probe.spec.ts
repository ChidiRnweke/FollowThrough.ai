// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { it } from 'vitest';
import { noteMarkdownExtensions } from './markdown-extensions';

it('probe appended metas', () => {
	const editor = new Editor({
		element: document.createElement('div'),
		extensions: noteMarkdownExtensions,
		content: {
			type: 'doc',
			content: [
				{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
				{ type: 'mermaid', content: [{ type: 'text', text: 'graph LR' }] }
			]
		}
	});
	editor.registerPlugin(
		new Plugin({
			appendTransaction(transactions, _old, state) {
				for (const tr of transactions) {
					if (tr.docChanged) {
						const steps = tr.steps.map((s) => `${s.constructor.name}:${s.from}-${s.to}`).join('|');
						const slice = tr.steps[0]?.slice;
						let sliceNames = '?';
						if (slice && slice.content.size > 0) {
							const names: string[] = [];
							slice.content.forEach((n) => names.push(n.type.name));
							sliceNames = names.join(',');
						}
						const metas = Object.keys(tr.getMeta() ?? {});
						console.log(
							'APP',
							steps,
							'slice',
							sliceNames,
							'root?',
							tr.getMeta('appendedTransaction') ? 'no' : 'yes',
							'metaKeys',
							metas.join(',')
						);
					}
				}
			}
		})
	);
	editor.commands.setTextSelection(6);
	editor.view.dom.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
	);
	editor.destroy();
});
