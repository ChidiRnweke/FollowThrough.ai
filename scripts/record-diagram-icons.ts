import { readFile, writeFile } from 'node:fs/promises';

/**
 * The icon names that actually exist, held offline.
 *
 * `icons-resolvable` needs to tell `logos:azure-search` from a name the model
 * invented, and the difference is a network round trip we refuse to make inside
 * an eval run. So the collections the agent draws brand marks from are fetched
 * once, in full, and committed.
 *
 * Only these collections are recorded, and the rule judges only these: a name
 * from a collection nobody harvested is left alone rather than failed on the
 * strength of a list we never fetched.
 */
const COLLECTIONS = [
	'logos',
	'simple-icons',
	'devicon',
	'skill-icons',
	'vscode-icons',
	'cib',
	'fa6-brands'
] as const;

const manifestPath = new URL('../src/evals/fixtures/diagrams/icon-manifest.json', import.meta.url);

interface CollectionResponse {
	readonly uncategorized?: readonly string[];
	readonly categories?: Readonly<Record<string, readonly string[]>>;
	readonly hidden?: readonly string[];
}

const namesIn = (body: CollectionResponse): readonly string[] => [
	...(body.uncategorized ?? []),
	...Object.values(body.categories ?? {}).flat(),
	...(body.hidden ?? [])
];

if (process.argv.includes('--record')) {
	const collections: Record<string, readonly string[]> = {};
	for (const prefix of COLLECTIONS) {
		const response = await fetch(`https://api.iconify.design/collection?prefix=${prefix}`);
		if (!response.ok)
			throw new Error(`The icon library answered ${response.status} for "${prefix}".`);
		const body: CollectionResponse = await response.json();
		const names = [...new Set(namesIn(body))].sort();
		if (names.length === 0) throw new Error(`The icon library returned no names for "${prefix}".`);
		collections[prefix] = names;
		process.stdout.write(`${prefix}: ${names.length} icons\n`);
	}
	await writeFile(manifestPath, `${JSON.stringify({ collections }, null, 0)}\n`, 'utf8');
	process.stdout.write(`Recorded ${COLLECTIONS.length} icon collections.\n`);
} else {
	const manifest: { readonly collections: Readonly<Record<string, readonly string[]>> } =
		JSON.parse(await readFile(manifestPath, 'utf8'));
	const absent = COLLECTIONS.filter((prefix) => !manifest.collections[prefix]?.length);
	if (absent.length > 0) {
		process.stderr.write(
			`The icon manifest is missing collections: ${absent.join(', ')}. Re-run with --record.\n`
		);
		process.exitCode = 1;
	} else {
		const total = Object.values(manifest.collections).reduce((sum, names) => sum + names.length, 0);
		process.stdout.write(
			`Icon manifest holds ${total} names across ${COLLECTIONS.length} collections.\n`
		);
	}
}
