import type { RenderedMarkdown, ChatMarkdownSegment } from '$lib/models/markdown';
import { buttonVariants } from '$lib/components/ui/button';
import DOMPurify from 'dompurify';
import { Marked } from 'marked';

/**
 * A parse that failed keeps the text it could not format, so the caller can show
 * the raw content rather than a hole. Model output is arbitrary, and marked
 * throws on inputs it cannot tokenize — see the `inlineMath` crash that "$3-4 vs
 * $30 per 1,000 pages" used to trigger.
 */

// Dedicated instance: Tiptap's Markdown extension registers tokenizer-only
// extensions (e.g. inlineMath) on the global marked singleton, which would
// make marked.parse throw on text containing "$...$" pairs.
const renderer = new Marked({ breaks: true, gfm: true });

// Dedicated instance too: the remote-image hook below is added for one render call and must
// never run inside another module's sanitize (Mermaid's uses the shared default instance).
const purifier = DOMPurify();

/** Marks a placeholder for an image that waits for the reader; its value is the image URL. */
const REMOTE_IMAGE = 'data-remote-image';
/** Marks the placeholder's button that loads the image. */
const LOAD_REMOTE_IMAGE = 'data-load-remote-image';
/** Attributes whose URL the browser fetches as soon as the element is in the page. */
const FETCHED_ATTRIBUTES = ['src', 'poster', 'background'] as const;

/**
 * True for a URL the browser can show without asking another server: this app's own origin
 * (attachments are `/api/attachments/<id>/content`), or bytes already in the page.
 */
function loadsWithoutAsking(url: URL): boolean {
	return url.protocol === 'data:' || url.protocol === 'blob:' || url.origin === location.origin;
}

/**
 * The inert stand-in for a remote image: the host it would contact and a button to load it.
 * It renders inside `{@html}`, where a Svelte `Button` cannot mount, so the button carries the
 * same `buttonVariants` classes. The placeholder's own nodes are sanitized after this hook.
 */
function remoteImagePlaceholder(image: HTMLImageElement, source: string): HTMLElement {
	const document = image.ownerDocument;
	const placeholder = document.createElement('span');
	placeholder.className = 'remote-image';
	placeholder.setAttribute(REMOTE_IMAGE, source);
	const host = document.createElement('span');
	host.className = 'remote-image-host';
	host.title = source;
	host.textContent = URL.parse(source)?.host || source;
	const button = document.createElement('button');
	button.type = 'button';
	button.className = buttonVariants({ variant: 'outline', size: 'xs' });
	button.setAttribute(LOAD_REMOTE_IMAGE, '');
	button.textContent = 'Load image';
	placeholder.append(host, button);
	return placeholder;
}

/**
 * Keeps rendered Markdown from contacting another server until the reader asks. An image from
 * elsewhere becomes a placeholder unless its URL is in `approved`; any other fetched attribute
 * that points elsewhere is dropped. `srcset` and `style` are forbidden outright in the sanitize
 * call: one names URLs per density, the other through CSS `url()`.
 */
function holdRemoteResources(node: Node, approved: ReadonlySet<string>): void {
	if (!(node instanceof HTMLElement)) return;
	for (const name of FETCHED_ATTRIBUTES) {
		const value = node.getAttribute(name);
		if (value === null) continue;
		// A value that is no URL loads nothing, but it is not shown as an image either.
		const url = URL.parse(value, location.href);
		if (url !== null && loadsWithoutAsking(url)) continue;
		if (!(node instanceof HTMLImageElement && name === 'src')) node.removeAttribute(name);
		else if (!approved.has(value)) return node.replaceWith(remoteImagePlaceholder(node, value));
	}
}

/** The URL whose placeholder button was clicked, or null when the click was elsewhere. */
export function requestedRemoteImage(event: MouseEvent): string | null {
	if (!(event.target instanceof Element) || !event.target.closest(`[${LOAD_REMOTE_IMAGE}]`))
		return null;
	return event.target.closest(`[${REMOTE_IMAGE}]`)?.getAttribute(REMOTE_IMAGE) ?? null;
}

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
 * Renders user- or model-authored markdown to sanitized HTML. An image from another server
 * renders as a placeholder until its URL is in `approvedImages`, which the caller fills when
 * the reader presses the placeholder's button (`requestedRemoteImage`).
 *
 * Chat text arrives a chunk at a time, and a half-received chunk is regularly
 * unparseable. Catching here rather than at an error boundary is what makes that
 * self-healing: the next chunk re-runs this and renders normally, where a
 * boundary would latch on the first bad chunk and stay broken for the rest of
 * the stream.
 *
 * `parser` exists so tests can supply an instance that reproduces a real crash.
 */
export function renderMarkdown(
	text: string,
	approvedImages: ReadonlySet<string>,
	parser: Marked = renderer
): RenderedMarkdown {
	if (!text.trim()) return { kind: 'rendered', html: '' };
	const hold = (node: Node) => holdRemoteResources(node, approvedImages);
	purifier.addHook('afterSanitizeAttributes', hold);
	try {
		const rendered = parser.parse(text, { async: false });
		return {
			kind: 'rendered',
			html: purifier.sanitize(rendered, {
				USE_PROFILES: { html: true },
				FORBID_ATTR: ['srcset', 'style']
			})
		};
	} catch {
		return { kind: 'failure', raw: text };
	} finally {
		purifier.removeHook('afterSanitizeAttributes', hold);
	}
}
