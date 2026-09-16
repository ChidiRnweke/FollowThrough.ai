import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ValidationError } from '$lib/errors';

const runMermaidParser = (sourcePath: string): Promise<void> =>
	new Promise((resolve, reject) => {
		const parser = spawn(
			process.execPath,
			[
				'--input-type=module',
				'--eval',
				`import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const source = await readFile(process.argv[1], 'utf8');
try {
	// This runs in a sandboxed child process (not the app bundle); the import is
	// deferred until after the JSDOM shim above so mermaid evaluates with the DOM.
	const { default: mermaid } = await import('mermaid');
	await mermaid.parse(source);
} catch (error) {
	process.stderr.write(error instanceof Error ? error.message : String(error));
	process.exitCode = 2;
} finally {
	dom.window.close();
}`,
				sourcePath
			],
			{
				cwd: process.cwd(),
				env: {
					HOME: process.env.HOME,
					PATH: process.env.PATH,
					NODE_ENV: 'production'
				},
				stdio: ['ignore', 'ignore', 'pipe'],
				timeout: 15_000,
				windowsHide: true
			}
		);
		let stderr = '';
		parser.stderr?.setEncoding('utf8');
		parser.stderr?.on('data', (chunk: string) => {
			if (stderr.length < 2_000) stderr += chunk;
		});
		parser.once('error', reject);
		parser.once('close', (code) => {
			if (code === 0) return resolve();
			reject(
				new Error(
					stderr.trim().slice(0, 2_000) ||
						`Mermaid could not parse the source (parser exit ${String(code)}).`
				)
			);
		});
	});

const parseMermaidSource = async (source: string): Promise<void> => {
	const directory = await mkdtemp(join(tmpdir(), 'followthrough-mermaid-'));
	const sourcePath = join(directory, 'diagram.mmd');
	try {
		await writeFile(sourcePath, source, { encoding: 'utf8', mode: 0o600 });
		await runMermaidParser(sourcePath);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
};

export class MermaidSubmissionValidator {
	/** The injected parse raises on invalid source; its result is not read. */
	constructor(private readonly parse: (source: string) => Promise<void> = parseMermaidSource) {}

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
		try {
			await this.parse(source);
		} catch (error) {
			throw new ValidationError(
				`Invalid Mermaid syntax: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
}

export const assertRenderedPng = (dataUrl: string | undefined): void => {
	if (!dataUrl) return;
	const encoded = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)?.[1];
	if (!encoded) throw new ValidationError('Rendered diagram must be a base64 PNG.');
	const bytes = Buffer.from(encoded, 'base64');
	if (bytes.byteLength > 10 * 1024 * 1024)
		throw new ValidationError('Rendered diagram exceeds the 10 MiB limit.');
	if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
		throw new ValidationError('Rendered diagram is not a valid PNG.');
};

export const diagramRevisionModel = (
	configuredModel: string,
	supportsVision: boolean,
	renderedPngDataUrl: string | undefined,
	fallbackVisionModel: string
): string => (renderedPngDataUrl && !supportsVision ? fallbackVisionModel : configuredModel);
