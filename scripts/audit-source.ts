import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { analyzeSource } from './audit-source-rules.ts';
const root = resolve(import.meta.dirname, '..');
const files: string[] = [];
const collect = (directory: string): void => {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) collect(path);
			continue;
		}
		if (
			!/\.(?:ts|svelte)$/.test(entry.name) ||
			/\.(?:spec|test|e2e)\.ts$|\.d\.ts$/.test(entry.name)
		)
			continue;
		files.push(relative(root, path));
	}
};
collect(resolve(root, 'src'));
const violations = files.flatMap((file) => {
	const text = readFileSync(resolve(root, file), 'utf8');
	if (!file.endsWith('.svelte'))
		return analyzeSource(file, text).map((item) => ({ file, ...item }));
	return [...text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].flatMap((match) => {
		const lineOffset = text.slice(0, match.index).split('\n').length - 1;
		return analyzeSource(file, match[1] ?? '', lineOffset).map((item) => ({ file, ...item }));
	});
});
if (violations.length) {
	process.stderr.write(
		`${violations.length} source audit violation(s):\n${violations.map((item) => `${item.file}:${item.line} [${item.rule}] ${item.message}`).join('\n')}\n`
	);
	process.exit(1);
}
process.stdout.write(`Source audit passed at zero violations for ${files.length} files.\n`);
