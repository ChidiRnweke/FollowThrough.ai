import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { runInContext, Script } from 'node:vm';
import { JSDOM } from 'jsdom';
import { ValidationError } from '$lib/errors';

const require = createRequire(import.meta.url);

export interface MermaidSourceValidator {
	validate(source: string): Promise<void>;
}

/** Rejects unsafe Mermaid constructs, then parses the source with Mermaid's own parser. */
export class MermaidSubmissionValidator implements MermaidSourceValidator {
	async validate(source: string): Promise<void> {
		if (source.includes('```'))
			throw new ValidationError('Submit Mermaid source without code fences.');
		if (/%%\s*\{/i.test(source))
			throw new ValidationError(
				'Mermaid initialization and configuration directives are not allowed.'
			);
		if (/^\s*(?:click|href)\s+/im.test(source) || /javascript:/i.test(source))
			throw new ValidationError('Links and click handlers are not allowed in Mermaid diagrams.');
		if (/<\/?[a-z][^>]*>/i.test(source))
			throw new ValidationError(
				'HTML labels are not allowed in Mermaid diagrams. Use escaped \\n inside quoted labels instead.'
			);
		const failure = await mermaidParseFailure(source);
		if (failure !== undefined) throw new ValidationError(`Invalid Mermaid syntax: ${failure}`);
	}
}

/**
 * Mermaid's sanitizer binds to a DOM window when it loads, so the browser bundle runs as a
 * script inside a private jsdom window. The server's own globals never gain a `window`.
 * Returns Mermaid's message for invalid source.
 */
async function mermaidParseFailure(source: string): Promise<string | undefined> {
	const bundle = new Script(await readFile(require.resolve('mermaid/dist/mermaid.min.js'), 'utf8'));
	const dom = new JSDOM('', { runScripts: 'outside-only' });
	try {
		const context = dom.getInternalVMContext();
		bundle.runInContext(context);
		const parse: (text: string) => Promise<string | undefined> = runInContext(
			'(text) => mermaid.parse(text).then(() => undefined, (error) => String(error?.message ?? error))',
			context
		);
		return await parse(source);
	} finally {
		dom.window.close();
	}
}
