// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import TableOfContents, { getHierarchicalIndexes } from '@tiptap/extension-table-of-contents';
import { describe, expect, it } from 'vitest';
import extensions from '$lib/components/edra/commands/extensions';
import { findProseMirrorDocumentIssue, readProseMirrorDocument } from '$lib/models/notes';
import { unknownProseMirrorNodes } from '$lib/models/notes';

/**
 * What the editor writes must be what the model accepts.
 *
 * This is the test whose absence took `/today` down. `proseMirrorDocumentSchema`
 * was checked only against hand-written literals and against
 * `noteContentFromMarkdown`, which builds JSON from a Markdown AST without ever
 * constructing a ProseMirror node — so it never runs `Node.toJSON()` and never
 * materializes an attribute default. Every input the schema had ever seen was
 * written by the same mental model as the schema. `textAlign: null` reached 659
 * of 663 stored values without a single test noticing.
 *
 * The corpus spec covers what is already stored. This covers what will be
 * stored next: it runs the real extension list, so adding or reconfiguring an
 * extension fails here rather than in production.
 *
 * The extension set is *imported*, never re-listed. `noteMarkdownExtensions`
 * is a hand-maintained subset that dropped TableOfContents as "contributing no
 * schema" — true of node types, false of the global attributes that broke this.
 * A conformance test that maintains its own copy of the producer is not testing
 * the producer.
 */
const editorWith = (html: string): Editor =>
	new Editor({
		element: document.createElement('div'),
		extensions: [
			...extensions,
			TableOfContents.configure({ getIndex: getHierarchicalIndexes, scrollParent: undefined })
		],
		content: html
	});

/** Everything with a node type or a global attribute the editor can serialize. */
const KITCHEN_SINK = `
	<h1>Heading one</h1>
	<h2>Heading two</h2>
	<h3>Heading three</h3>
	<h4>Heading four</h4>
	<p style="text-align: right">Aligned paragraph</p>
	<p>Plain paragraph with <strong>bold</strong>, <em>italic</em>, <s>strike</s>,
		<code>code</code>, <u>underline</u> and
		<a href="https://example.test/x" title="t">a link</a>.</p>
	<ul><li><p>Bulleted</p></li></ul>
	<ol start="3"><li><p>Numbered</p></li></ol>
	<blockquote><p>Quoted</p></blockquote>
	<pre><code class="language-ts">const x = 1;</code></pre>
	<table><tbody>
		<tr><th colspan="2">Header</th></tr>
		<tr><td>One</td><td>Two</td></tr>
	</tbody></table>
	<hr>
	<p>Before<br>after</p>
	<img src="https://example.test/a.png" alt="a" title="t" width="120" height="80">
`;

describe('what the real editor serializes', () => {
	const document = () => editorWith(KITCHEN_SINK).getJSON();

	// The strict schema, not the resilient reader: this JSON is what `saveNote`
	// posts, and `remote/notes` parses it with exactly this schema. A document
	// the editor can produce and the write boundary rejects is an unsaveable note.
	it('satisfies the schema its own save path parses it with', () => {
		expect(findProseMirrorDocumentIssue(document())).toBeUndefined();
	});

	it('produces no block the model had to fall back on', () => {
		expect(unknownProseMirrorNodes(readProseMirrorDocument(document()))).toEqual([]);
	});

	// The two defaults that actually broke, pinned individually so a regression
	// names itself instead of arriving as "the kitchen sink stopped parsing".
	it('writes a null textAlign on an unaligned paragraph, and the schema takes it', () => {
		const paragraph = editorWith('<p>Unaligned</p>').getJSON().content?.[0];
		expect(paragraph?.attrs?.textAlign).toBeNull();
	});

	it('accepts the table-of-contents attributes the extension adds to a heading', () => {
		expect(findProseMirrorDocumentIssue(editorWith('<h2>Anchored</h2>').getJSON())).toBeUndefined();
	});
});
