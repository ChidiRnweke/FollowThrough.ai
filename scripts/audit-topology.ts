import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures: string[] = [];

const removedPaths = [
	'src/lib/components/app',
	'src/lib/models/domain.ts',
	'src/lib/models/index.ts',
	'src/lib/server/repositories/index.ts',
	'src/lib/server/repositories/postgres',
	'src/lib/server/db/schema.ts'
];

for (const path of removedPaths) {
	if (existsSync(resolve(root, path))) failures.push(`${path} is a removed generic bucket`);
}

const sourceFiles: string[] = [];
const collect = (directory: string): void => {
	if (!existsSync(directory)) return;
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) collect(path);
		else if (/\.(?:ts|svelte)$/.test(entry.name)) sourceFiles.push(path);
	}
};
collect(resolve(root, 'src'));

for (const absolute of sourceFiles) {
	const file = relative(root, absolute);
	const segments = file.split('/');
	if (segments.includes('pages') || segments.includes('panels'))
		failures.push(`${file} uses a removed generic component bucket`);

	const source = readFileSync(absolute, 'utf8');
	if (/from\s+['"]\$lib\/models['"]/.test(source))
		failures.push(`${file} imports the removed global model barrel`);
	if (/from\s+['"]\$lib\/server\/repositories['"]/.test(source))
		failures.push(`${file} imports the removed global repository barrel`);
	if (/from\s+['"]\$lib\/server\/services['"]/.test(source))
		failures.push(`${file} imports the removed global service barrel`);
	if (/from\s+['"]\$lib\/server\/controllers['"]/.test(source))
		failures.push(`${file} imports the removed global controller barrel`);
	if (
		file.startsWith('src/lib/components/ui/') &&
		source.includes('bind:ref') &&
		source.includes('ref = $bindable()')
	)
		failures.push(`${file} forwards an undefined ref into a component with a fallback`);
}

if (failures.length > 0) {
	process.stderr.write(`${failures.join('\n')}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(`Topology audit passed for ${sourceFiles.length} source files.\n`);
}
