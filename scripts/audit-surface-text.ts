import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { scanSurfaceText, surfaceTextUtilities, type SurfaceTextFinding } from './surface-text.ts';

const root = resolve(import.meta.dirname, '..');
const files: string[] = [];
function collect(directory: string): void {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) collect(path);
		else if (/\.(svelte|ts|css)$/.test(entry.name) && !/\.(spec|test|e2e|d)\.ts$/.test(entry.name))
			files.push(path);
	}
}
collect(resolve(root, 'src'));
const utilities = surfaceTextUtilities(
	readFileSync(resolve(root, 'src/routes/layout.css'), 'utf8')
);
const findings: SurfaceTextFinding[] = [];
const unresolved = new Set<string>([
	'Report only: source candidates are not proven contrast violations. A clean inventory is not a clean rendered audit.',
	'Opacity candidates include separate disabled/reveal notes; images, gradients, animations, and runtime state still require browser inspection.'
]);
for (const file of files.sort()) {
	const report = scanSurfaceText(relative(root, file), readFileSync(file, 'utf8'), utilities);
	findings.push(...report.findings);
	for (const limitation of report.unresolved) unresolved.add(limitation);
}
const sourceLocations = new Set(findings.map((finding) => `${finding.file}:${finding.line}`)).size;
if (process.argv.includes('--json'))
	process.stdout.write(
		`${JSON.stringify({ filesScanned: files.length, sourceLocations, findings, unresolved: [...unresolved] }, null, 2)}\n`
	);
else {
	process.stdout.write(
		`${findings.length} surface-text candidates across ${sourceLocations} locations in ${files.length} source files (report only).\n`
	);
	for (const finding of findings)
		process.stdout.write(
			`${finding.file}:${finding.line} [${finding.kind}; ${finding.state}] ${finding.text} on ${finding.surface}\n  ${finding.evidence}\n${[...new Set(finding.unresolved)].map((item) => `  Review: ${item}`).join('\n')}\n`
		);
	process.stdout.write(
		`\nLimitations:\n${[...unresolved].map((item) => `- ${item}`).join('\n')}\n`
	);
}
