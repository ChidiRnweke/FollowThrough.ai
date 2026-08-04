import DOMPurify from 'dompurify';
import { Marked } from 'marked';

/**
 * A parse that failed keeps the text it could not format, so the caller can show
 * the raw content rather than a hole. Model output is arbitrary, and marked
 * throws on inputs it cannot tokenize — see the `inlineMath` crash that "$3-4 vs
 * $30 per 1,000 pages" used to trigger.
 */
export type RenderedMarkdown = { ok: true; html: string } | { ok: false; raw: string };

// Dedicated instance: Tiptap's Markdown extension registers tokenizer-only
// extensions (e.g. inlineMath) on the global marked singleton, which would
// make marked.parse throw on text containing "$...$" pairs.
const renderer = new Marked({ breaks: true, gfm: true });

/**
 * Renders user- or model-authored markdown to sanitized HTML.
 *
 * Chat text arrives a chunk at a time, and a half-received chunk is regularly
 * unparseable. Catching here rather than at an error boundary is what makes that
 * self-healing: the next chunk re-runs this and renders normally, where a
 * boundary would latch on the first bad chunk and stay broken for the rest of
 * the stream.
 *
 * `parser` exists so tests can supply an instance that reproduces a real crash.
 */
export function renderMarkdown(text: string, parser: Marked = renderer): RenderedMarkdown {
	if (!text.trim()) return { ok: true, html: '' };
	try {
		const rendered = parser.parse(text, { async: false });
		return { ok: true, html: DOMPurify.sanitize(rendered, { USE_PROFILES: { html: true } }) };
	} catch {
		return { ok: false, raw: text };
	}
}
