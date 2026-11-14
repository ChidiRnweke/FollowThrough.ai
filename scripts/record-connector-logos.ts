import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { CONNECTOR_CATALOG } from '../src/lib/models/connectors/index.ts';

/**
 * The catalog connectors' logos, recorded once and committed (ADR 0049).
 *
 * Each catalog entry names its mark in SVG Logos (gilbarbara/logos, CC0-1.0),
 * which Iconify serves under the `logos:` prefix. The files are vendored rather
 * than hotlinked so a page that lists connectors never sends the reader's
 * browser to a third party, and so every mark passes review before it ships.
 *
 * `--record` fetches every entry's mark; without it the script checks that each
 * entry has a recorded file and that no file is left over.
 */
const directory = new URL('../static/connector-logos/', import.meta.url);

/** A vendored mark is drawing only: no script, no handlers, nothing fetched from elsewhere. */
const unsafe = /<script|<foreignObject|\son[a-z]+=|(?:href|src)=["']?(?:https?:|\/\/|data:)/i;

if (process.argv.includes('--record')) {
	await mkdir(directory, { recursive: true });
	for (const entry of CONNECTOR_CATALOG) {
		const response = await fetch(`https://api.iconify.design/logos/${entry.logo}.svg`);
		if (!response.ok) throw new Error(`SVG Logos answered ${response.status} for ${entry.logo}.`);
		const svg = await response.text();
		if (!svg.trimStart().startsWith('<svg')) throw new Error(`${entry.logo} is not an SVG.`);
		if (unsafe.test(svg)) throw new Error(`${entry.logo} contains more than a drawing.`);
		await writeFile(new URL(`${entry.id}.svg`, directory), `${svg.trim()}\n`, 'utf8');
		process.stdout.write(`${entry.id}: logos:${entry.logo}\n`);
	}
	process.stdout.write(`Recorded ${CONNECTOR_CATALOG.length} connector logos.\n`);
} else {
	const files = new Set(await readdir(directory));
	const missing = CONNECTOR_CATALOG.filter((entry) => !files.has(`${entry.id}.svg`));
	const known = new Set(CONNECTOR_CATALOG.map((entry) => `${entry.id}.svg`));
	const extra = [...files].filter((file) => !known.has(file));
	const altered: string[] = [];
	for (const file of known)
		if (files.has(file) && unsafe.test(await readFile(new URL(file, directory), 'utf8')))
			altered.push(file);
	if (missing.length || extra.length || altered.length) {
		process.stderr.write(
			[
				missing.length && `Missing logos: ${missing.map((entry) => entry.id).join(', ')}.`,
				extra.length && `Logos for no catalog entry: ${extra.join(', ')}.`,
				altered.length && `Logos with more than a drawing: ${altered.join(', ')}.`,
				'Re-run with --record.'
			]
				.filter(Boolean)
				.join('\n') + '\n'
		);
		process.exitCode = 1;
	} else process.stdout.write(`All ${CONNECTOR_CATALOG.length} connector logos are recorded.\n`);
}
