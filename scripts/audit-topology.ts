import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures: string[] = [];

for (const entry of readdirSync(resolve(root, 'src/lib/server'))) {
	if (/factory(?:\.spec)?\.ts$/.test(entry))
		failures.push(
			`src/lib/server/${entry} is a factory outside src/lib/server/factories (capabilities/, agent/, or the factories root)`
		);
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
	'todos',
	'widgets'
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
			/from\s+['"]\$lib\/components\/(?:agent|artifacts|attachments|chat|diagrams|feedback|memory|notes|projects|settings|shell|skills|suggestions|today|todos|widgets)(?:\/|['"])/.test(
				source
			)
		)
			failures.push(`${file} imports a product component capability from the Edra boundary`);
	}
}

const applicationPath = resolve(root, 'src/lib/server/application.ts');
const applicationSource = readFileSync(applicationPath, 'utf8');
// Chisel's composition-root rules cover concrete imports, construction and
// placeholder casts. Assigning a collaborator after construction is the same
// cycle spelled as a property write.
if (/\.executor\s*=/.test(applicationSource))
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

/**
 * Every parser a database mapper reads rows with must be exercised by the corpus
 * spec.
 *
 * The strict ProseMirror union shipped green and took `/today` down on the first
 * real page load, because every test that had validated it fed it either a
 * hand-written literal or the output of other code in this repository. A schema
 * and its fixtures, written from one mental model, agree with each other and
 * with nothing else. The corpus is captured from a real database
 * (`pnpm corpus:capture`), so it is the one input a schema's author did not
 * write — and a read boundary that skips it is a boundary nobody has checked
 * against its producer.
 */
const mapperSource = readFileSync(resolve(root, 'src/lib/server/db/mappers.ts'), 'utf8');
const corpusSpecPath = 'tests/unit/corpus.spec.ts';
const corpusSource = readFileSync(resolve(root, corpusSpecPath), 'utf8');
const mapperParsers = new Set(
	[...mapperSource.matchAll(/\b((?:parse|read)[A-Z][A-Za-z0-9]*)\s*\(/g)].map((match) => match[1]!)
);
for (const parser of [...mapperParsers].sort()) {
	if (!corpusSource.includes(parser))
		failures.push(
			`${parser} reads stored rows in src/lib/server/db/mappers.ts but is not covered by ${corpusSpecPath}`
		);
}

if (failures.length > 0) {
	process.stderr.write(`${failures.join('\n')}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(`Topology audit passed for ${sourceFiles.length} source files.\n`);
}
