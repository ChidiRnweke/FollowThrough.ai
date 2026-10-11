import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import ts from 'typescript';
import { analyzeArchitecture } from './audit-architecture-rules.ts';

const root = resolve(
	process.argv.find((argument) => argument.startsWith('--root='))?.slice(7) ??
		resolve(import.meta.dirname, '..')
);
const files: Record<string, string> = {};
const collect = (directory: string): void => {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) collect(path);
		else if (
			/\.(?:ts|svelte)$/.test(entry.name) &&
			!/\.(?:spec|test|e2e)\.ts$|\.d\.ts$/.test(entry.name)
		)
			files[relative(root, path)] = readFileSync(path, 'utf8');
	}
};
collect(resolve(root, 'src'));
const configFile = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
if (configFile.error)
	throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
if (config.errors.length)
	throw new Error(
		config.errors
			.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
			.join('\n')
	);
const violations = analyzeArchitecture(files, root, config.options);
if (process.argv.includes('--json'))
	process.stdout.write(`${JSON.stringify({ violations }, null, 2)}\n`);
else if (violations.length)
	process.stderr.write(
		`${violations.length} semantic architecture violation(s):\n${violations.map((item) => `${item.file}:${item.line}:${item.column} [${item.rule}] ${item.message}${item.provenance.length ? `\n  via ${item.provenance.join(' -> ')}` : ''}`).join('\n')}\n`
	);
else
	process.stdout.write(
		`Semantic architecture audit passed for ${Object.keys(files).length} source files.\n`
	);
process.exitCode = violations.length ? 1 : 0;
