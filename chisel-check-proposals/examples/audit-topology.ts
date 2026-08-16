import { existsSync, globSync, readdirSync, readFileSync } from 'node:fs';
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
const componentCapabilities = new Set([
	'agent',
	'artifacts',
	'attachments',
	'chat',
	'diagrams',
	'feedback',
	'memory',
	'notes',
	'projects',
	'settings',
	'shell',
	'skills',
	'suggestions',
	'today',
	'todos'
]);
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
	for (const match of source.matchAll(/from\s+['"]\$lib\/components\/([^/'"]+)(\/[^'"]+)['"]/g)) {
		const importedCapability = match[1];
		if (!componentCapabilities.has(importedCapability)) continue;
		const owningCapability =
			segments[0] === 'src' && segments[1] === 'lib' && segments[2] === 'components'
				? segments[3]
				: undefined;
		if (owningCapability === importedCapability) {
			failures.push(`${file} uses a $lib deep import inside its own component capability`);
		} else {
			failures.push(`${file} bypasses the ${importedCapability} component capability entry`);
		}
	}
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
	if (file.startsWith('src/lib/components/edra/')) {
		if (/from\s+['"]\$lib\/client(?:\/|['"])/.test(source))
			failures.push(`${file} imports a product client adapter from the Edra boundary`);
		if (/from\s+['"]\$lib\/models\//.test(source))
			failures.push(`${file} imports a product model from the Edra boundary`);
		if (
			/from\s+['"]\$lib\/components\/(?:agent|artifacts|attachments|chat|diagrams|feedback|memory|notes|projects|settings|shell|skills|suggestions|today|todos)(?:\/|['"])/.test(
				source
			)
		)
			failures.push(`${file} imports a product component capability from the Edra boundary`);
	}
}

const applicationPath = resolve(root, 'src/lib/server/application.ts');
const applicationSource = readFileSync(applicationPath, 'utf8');
if (
	/^import(?!\s+type\b)[^;]*from\s+['"][^'"]*\/(?:repositories|services)\//m.test(applicationSource)
)
	failures.push('src/lib/server/application.ts imports a concrete repository or service');
for (const match of applicationSource.matchAll(/\bnew\s+([A-Z][A-Za-z0-9_]*)/g)) {
	if (match[1] !== 'ProductionControllerFactory')
		failures.push(
			`src/lib/server/application.ts constructs ${match[1]} outside a capability factory`
		);
}
if (/\bLateValue\b|undefined\s+as\s+unknown|\.executor\s*=/.test(applicationSource))
	failures.push('src/lib/server/application.ts contains cyclic placeholder wiring');

for (const absolute of sourceFiles.filter((path) => path.endsWith('-capability-factory.ts'))) {
	const file = relative(root, absolute);
	const source = readFileSync(absolute, 'utf8');
	const createFunctions = [
		...source.matchAll(/export\s+const\s+(create[A-Z][A-Za-z0-9]*Capability)\s*=/g)
	];
	if (createFunctions.length !== 1)
		failures.push(`${file} must export exactly one create<Capability>Capability function`);
}

const vitestSource = readFileSync(resolve(root, 'vitest.config.ts'), 'utf8');
for (const include of vitestSource.matchAll(/\binclude:\s*(\[[\s\S]*?\]|'[^']+'|"[^"]+")/g)) {
	const patterns = [...include[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
	for (const pattern of patterns) {
		if (globSync(pattern, { cwd: root }).length === 0)
			failures.push(`vitest include ${pattern} matches no files`);
	}
}

const maintainedDocuments = [
	'README.md',
	'ARCHITECTURE.md',
	'DESIGN_SYSTEM.md',
	...readdirSync(resolve(root, 'docs'))
		.filter((name) => name.endsWith('.md') && name !== 'TEST_GAPS.md')
		.map((name) => `docs/${name}`)
];
for (const document of maintainedDocuments) {
	const source = readFileSync(resolve(root, document), 'utf8');
	for (const match of source.matchAll(
		/`((?:src|tests|scripts)\/[A-Za-z0-9_@./+()[\]-]+\.(?:ts|svelte|md))`/g
	)) {
		if (!existsSync(resolve(root, match[1])))
			failures.push(`${document} references missing maintained path ${match[1]}`);
	}
}

if (failures.length > 0) {
	process.stderr.write(`${failures.join('\n')}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(`Topology audit passed for ${sourceFiles.length} source files.\n`);
}
