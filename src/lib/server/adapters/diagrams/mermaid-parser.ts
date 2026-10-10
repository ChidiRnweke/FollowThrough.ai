import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { MermaidSyntaxReader } from '$lib/server/repositories/diagrams/mermaid-syntax';
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

export class NodeMermaidSyntaxReader implements MermaidSyntaxReader {
	parse(source: string): Promise<void> {
		return parseMermaidSource(source);
	}
}
