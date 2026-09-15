/** Snapshot evidence for this assessment, not a new architecture gate or call-graph proof. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const domainFamilies = {
	agent: [16, 17, 18, 19],
	'agent-files': [18],
	'api-tokens': [1],
	attachments: [14],
	deliverables: [15],
	artifacts: [15],
	diagrams: [13],
	'diagram-studio': [13],
	feedback: [25],
	identity: [1, 2],
	imports: [4],
	'inline-suggestions': [8],
	'knowledge-search': [20],
	memory: [11],
	notes: [4, 5, 7],
	projects: [3],
	proofreading: [8],
	provenance: [7],
	references: [10],
	relationships: [10],
	'relationships-and-references': [10],
	revisions: [4, 12, 13],
	skills: [12],
	suggestions: [10],
	telemetry: [25],
	todos: [9],
	today: [9],
	'user-settings': [2],
	workspace: [2, 21, 22],
	'workspace-bootstrap': [2],
	'workspace-mutations': [21],
	'workspace-records': [22],
	'workspace-sync': [21, 22],
	'workspace-views': [2, 23],
	'workspace-write-review': [21],
	'tool-display': [17, 18],
	markdown: [5, 6, 15],
	tokenization: [16, 20],
	outbox: [21],
	sync: [21, 22],
	workbench: [23],
	shell: [23],
	commands: [23],
	chat: [16, 17],
	settings: [2, 18, 19],
	search: [7, 20],
	pwa: [24],
	images: [6, 15],
	observability: [25],
	edra: [6],
	marketing: [1]
};

const familiesFor = (file) => {
	if (/^src\/evals\//.test(file)) return [27];
	if (/^scripts\//.test(file)) return /phoenix|log-record|otel/.test(file) ? [25, 27] : [26, 27];
	if (file === 'src/service-worker.ts') return [24];
	if (/^src\/(?:worker|env|hooks.server|seed-tool-embeddings)\./.test(file)) return [1, 18, 26];
	if (file === 'src/hooks.client.ts') return [25];
	if (/instrumentation|log-record|telemetry|(?:^|\/)errors(?:\.|\/)/.test(file)) return [25];
	if (/\/components\/(?:ui|icons|layout)\//.test(file) || /\/hooks\//.test(file)) return [23, 27];
	if (/\/components\/shared\//.test(file))
		return /sync|workspace/.test(file) ? [21, 22, 23] : [6, 23];
	if (/\/factories\//.test(file)) {
		const capability = file.match(/\/([^/]+)-capability-factory/);
		return capability && domainFamilies[capability[1]] ? domainFamilies[capability[1]] : [26];
	}
	if (/\/db\//.test(file)) {
		const table = file.match(/\/schema\/([^/.]+)/);
		return table && domainFamilies[table[1]] ? domainFamilies[table[1]] : [21, 26, 27];
	}
	if (/^src\/lib\/server\/(?:application|config|provision-db|services\/scheduler)/.test(file))
		return [26];
	if (/\/chats\//.test(file)) return [16, 17];
	if (/\/profile\//.test(file)) return [1, 11];
	if (/\/trash\//.test(file)) return [4, 13];
	if (/\/\(marketing\)\//.test(file)) return [1];
	if (/\/(?:\+layout|\+error)\./.test(file)) return [2, 23, 25];
	if (/^src\/(?:app|pdfmake)\.d\.ts$/.test(file) || /^src\/lib\/utils/.test(file)) return [27];
	if (/^src\/routes\/auth\//.test(file) || /\/waiting\//.test(file)) return [1];
	if (/^src\/routes\/mcp\//.test(file)) return [18];
	if (/client-errors/.test(file)) return [25];
	if (/\/offline\//.test(file)) return [24];
	const parts = file.split('/');
	const match = parts.find((part) => Object.hasOwn(domainFamilies, part));
	if (match) return domainFamilies[match];
	if (/^tests\//.test(file) || /\/testing\//.test(file)) return [27];
	return [];
};
const exported = (node) => node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const nameOf = (node) => node.name?.getText() ?? '<anonymous>';
const declarations = (file, text) => {
	const sections = file.endsWith('.svelte')
		? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
		: [text];
	const result = { exports: [], capabilities: [], tests: [], imports: [] };
	for (const section of sections) {
		const source = ts.createSourceFile(file, section, ts.ScriptTarget.Latest, true);
		for (const node of source.statements) {
			if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
				if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
					result.imports.push(node.moduleSpecifier.text);
				}
			}
			if (exported(node)) {
				if (ts.isVariableStatement(node)) {
					for (const declaration of node.declarationList.declarations)
						result.exports.push(nameOf(declaration));
				} else if (node.name) result.exports.push(nameOf(node));
			}
			if (ts.isInterfaceDeclaration(node) && /Controller$/.test(nameOf(node))) {
				for (const member of node.members) {
					if (ts.isMethodSignature(member))
						result.capabilities.push(`${nameOf(node)}.${nameOf(member)}`);
				}
			}
		}
		const visit = (node) => {
			if (ts.isCallExpression(node)) {
				const expression = node.expression.getText(source);
				if (/^(?:it|test)(?:\.|$)/.test(expression)) {
					const first = node.arguments[0];
					if (first && ts.isStringLiteralLike(first)) result.tests.push(first.text);
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	for (const key of Object.keys(result)) result[key] = [...new Set(result[key])];
	return result;
};

const files = git('ls-files', '-z', '--', 'src', 'tests', 'scripts')
	.split('\0')
	.filter((file) => /\.(?:ts|js|mjs|svelte)$/.test(file))
	.sort();
const digest = createHash('sha256');
const rows = files.map((file) => {
	const text = readFileSync(resolve(root, file), 'utf8');
	digest.update(file).update('\0').update(text).update('\0');
	const details = declarations(file, text);
	return {
		file,
		families: familiesFor(file),
		lines: text.split('\n').length - Number(text.endsWith('\n')),
		...details
	};
});
const inventory = {
	format: 1,
	sourceRevision: git('log', '-1', '--format=%H', '--', 'src', 'tests', 'scripts'),
	sourceDigest: digest.digest('hex'),
	notice:
		'Lexical inventory and candidate workflow families, not a resolved call graph or completed semantic review. Re-exports, dynamic dispatch, generated SDK tools and Svelte markup need human reconciliation. Empty families are explicit unclassified support paths.',
	files: rows
};
const json = `${JSON.stringify(inventory, null, 2)}\n`;
const target = resolve(directory, 'source-inventory.json');
if (process.argv.includes('--check')) {
	const stored = JSON.parse(readFileSync(target, 'utf8'));
	if (JSON.stringify(stored) !== JSON.stringify(inventory))
		throw new Error('Assessment inventory is stale; regenerate and review the source changes.');
} else writeFileSync(target, json);
const stats = {
	files: rows.length,
	controllerCapabilities: rows.reduce((n, r) => n + r.capabilities.length, 0),
	remoteFiles: rows.filter((r) => r.file.endsWith('.remote.ts')).length,
	serverRoutes: rows.filter((r) => r.file.endsWith('/+server.ts')).length,
	modelFiles: rows.filter((r) => r.file.startsWith('src/lib/models/') && !r.file.includes('.spec.'))
		.length,
	modelExports: rows
		.filter((r) => r.file.startsWith('src/lib/models/') && !r.file.includes('.spec.'))
		.reduce((n, r) => n + r.exports.length, 0),
	testTitles: rows.reduce((n, r) => n + r.tests.length, 0),
	unclassifiedFiles: rows.filter((r) => r.families.length === 0).length
};
process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
