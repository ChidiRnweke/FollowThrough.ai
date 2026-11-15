// Named `.svelte.spec.ts` to run in the browser project: sanitization goes
// through DOMPurify, which is inert without a real DOM.
import { describe, expect, it } from 'vitest';
import { Marked } from 'marked';
import { renderMarkdown } from './rendering';

/** A host that never resolves, so nothing here can reach a real server. */
const REMOTE_IMAGE = 'https://images.example.invalid/chart.png';
const PIXEL =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Parsed inertly: a document from DOMParser fetches nothing, so reading it starts no request. */
function renderedDocument(text: string, approved: ReadonlySet<string> = new Set()): Document {
	const result = renderMarkdown(text, approved);
	if (result.kind !== 'rendered') throw new Error(`Rendering failed for ${text}`);
	return new DOMParser().parseFromString(result.html, 'text/html');
}

const imageSources = (document: Document): (string | null)[] =>
	Array.from(document.querySelectorAll('img'), (image) => image.getAttribute('src'));

/** The text that used to crash the app, and a parser that still crashes on it. */
const UNPARSEABLE = '- $3-4 vs $30 per 1,000 pages';

function parserThatThrowsOnDollars(): Marked {
	const parser = new Marked({ breaks: true, gfm: true });
	parser.use({
		extensions: [
			{
				name: 'inlineMath',
				level: 'inline',
				start: (src: string) => src.indexOf('$'),
				tokenizer(src: string) {
					const match = src.match(/^\$([^$]+)\$(?!\$)/);
					if (!match) return undefined;
					// No renderer for this token, so parsing throws when it is walked.
					return { type: 'inlineMath', raw: match[0], latex: match[1].trim() };
				}
			}
		]
	});
	return parser;
}

describe('renderMarkdown', () => {
	it('degrades to the raw text when the parser throws', () => {
		const result = renderMarkdown(UNPARSEABLE, new Set(), parserThatThrowsOnDollars());
		expect(result).toEqual({ kind: 'failure', raw: UNPARSEABLE });
	});

	it('returns raw content on a parser failure and recovers on the next chunk', () => {
		const parser = parserThatThrowsOnDollars();
		const failed = renderMarkdown(UNPARSEABLE, new Set(), parser);
		const result = renderMarkdown('plain text', new Set(), parser);
		expect({ failed, recovered: result.kind }).toEqual({
			failed: { kind: 'failure', raw: UNPARSEABLE },
			recovered: 'rendered'
		});
	});

	it('treats blank content as nothing to render', () => {
		const result = renderMarkdown('   ', new Set());
		expect(result).toEqual({ kind: 'rendered', html: '' });
	});

	it('sanitizes event handlers out of inline HTML', () => {
		const result = renderMarkdown('<img src="x" alt="Unsafe" onerror="alert(1)">', new Set());
		expect(result.kind === 'rendered' && result.html.includes('onerror')).toBe(false);
	});

	it('renders an image link as an img element', () => {
		const result = renderMarkdown('![shot](/api/attachments/abc/content)', new Set());
		expect(
			result.kind === 'rendered' && result.html.includes('src="/api/attachments/abc/content"')
		).toBe(true);
	});

	it('shows an image from another server as a placeholder naming its host', () => {
		const document = renderedDocument(
			`See ![chart](${REMOTE_IMAGE}) and <img src="${REMOTE_IMAGE}">`
		);
		expect({
			images: imageSources(document),
			hosts: Array.from(document.querySelectorAll('.remote-image-host'), (host) => host.textContent)
		}).toEqual({ images: [], hosts: ['images.example.invalid', 'images.example.invalid'] });
	});

	it('still renders attachment, same-origin and inline images', () => {
		const document = renderedDocument(
			`![a](/api/attachments/abc/content) ![b](${location.origin}/api/attachments/def/content) ![c](${PIXEL})`
		);
		expect(imageSources(document)).toEqual([
			'/api/attachments/abc/content',
			`${location.origin}/api/attachments/def/content`,
			PIXEL
		]);
	});

	it('renders an image from another server once the reader has approved it', () => {
		const document = renderedDocument(`![chart](${REMOTE_IMAGE})`, new Set([REMOTE_IMAGE]));
		expect(imageSources(document)).toEqual([REMOTE_IMAGE]);
	});

	it('drops every other attribute that would fetch from another server', () => {
		const document = renderedDocument(
			`<video src="https://media.example.invalid/v.mp4" poster="https://media.example.invalid/p.png"></video>` +
				`<img src="/api/attachments/abc/content" srcset="https://media.example.invalid/2x.png 2x">` +
				`<span style="background-image: url(https://media.example.invalid/bg.png)">text</span>`
		);
		const fetched = Array.from(document.body.querySelectorAll('*')).flatMap((element) =>
			Array.from(element.attributes, (attribute) => attribute.value).filter((value) =>
				value.includes('media.example.invalid')
			)
		);
		expect(fetched).toEqual([]);
	});
});
