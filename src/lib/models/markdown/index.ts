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

export type ChatMarkdownSegment = { type: 'markdown' | 'diff' | 'mermaid'; content: string };

/** Only complete top-level fences become previews; streamed fences remain readable code. */
export function chatMarkdownSegments(text: string): ChatMarkdownSegment[] {
	// Marked normalizes line endings and omits reference definitions from its tokens.
	// Slice the original text so ordinary Markdown retains those definitions.
	text = text.replace(/\r\n?/g, '\n');
	const segments: ChatMarkdownSegment[] = [];
	let cursor = 0;
	let markdownStart = 0;
	for (const token of renderer.lexer(text)) {
		const start = text.indexOf(token.raw, cursor);
		cursor = start + token.raw.length;
		const language = token.type === 'code' ? token.lang?.trim().toLowerCase() : undefined;
		const opening = token.raw.match(/^ {0,3}(`{3,}|~{3,})[^\n]*\n/);
		const fence = opening?.[1];
		const complete =
			fence && new RegExp(`\\n {0,3}${fence[0]}{${fence.length},}[ \\t]*(?:\\n)?$`).test(token.raw);
		if (token.type === 'code' && complete && (language === 'mermaid' || language === 'diff')) {
			if (start > markdownStart)
				segments.push({ type: 'markdown', content: text.slice(markdownStart, start) });
			segments.push({ type: language, content: token.text });
			markdownStart = cursor;
		}
	}
	if (markdownStart < text.length)
		segments.push({ type: 'markdown', content: text.slice(markdownStart) });
	return segments;
}

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
