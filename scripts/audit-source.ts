import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

/**
 * Source-side companion to `audit-tests.ts`: the anti-patterns that let a defect
 * ship silently rather than fail loudly.
 *
 * Both checks ratchet against a migration baseline the way the test audit does —
 * the existing count is tolerated, growth is not.
 */

const root = resolve(import.meta.dirname, '..');
const files: string[] = [];
const collect = (directory: string): void => {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) collect(path);
			continue;
		}
		if (!/\.ts$/.test(entry.name)) continue;
		if (/\.(?:spec|test)\.ts$|\.e2e\.ts$/.test(entry.name)) continue;
		if (/\.d\.ts$/.test(entry.name)) continue;
		files.push(relative(root, path));
	}
};
collect(resolve(root, 'src'));

const failures: string[] = [];
const shapeCastExceptions: string[] = [];
const silentCatchExceptions: string[] = [];

/**
 * Baselines. Lower them as sites are fixed; never raise them.
 *
 * A raise means a new instance of a pattern that has already cost this codebase
 * a production defect, so it is a decision to make deliberately in a diff, not a
 * number to nudge when a check goes red.
 */
const shapeCastLimit = 33;
const silentCatchLimit = 68;

/** `// audit-allow: <rule> — <reason>` on the line above, mirroring chisel-ignore. */
const allowed = (rule: string, sourceText: string, line: number): boolean => {
	const lines = sourceText.split('\n');
	const preceding = lines[line - 2] ?? '';
	return new RegExp(`audit-allow:\\s*${rule}\\b`).test(preceding);
};

/**
 * A type assertion applied to an object literal.
 *
 * `x as never` on a single value is the branded-id escape hatch and stays
 * allowed: the value is still one thing, and the reader can see what it is.
 * Applying an assertion to a whole object turns off field-by-field checking for
 * a shape nobody has verified — which is how a required `conversationId` came to
 * be fed an optional one, compiled clean, and failed against the database.
 */
const isShapeCast = (node: ts.Node): boolean => {
	if (!ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node)) return false;
	// Unwrapped, so `({ … }) as never` is not a way around the rule.
	let inner: ts.Expression = node.expression;
	while (ts.isParenthesizedExpression(inner)) inner = inner.expression;
	return ts.isObjectLiteralExpression(inner);
};

/**
 * A `catch` that neither rethrows nor does anything observable.
 *
 * The shape this exists to stop is the quiet fallback: swallow the error, return
 * a plausible-looking default, and leave the caller unable to tell "there is no
 * data" from "the lookup failed". Any call inside the block — logging, a toast,
 * a metric, a recovery that reports itself — satisfies it.
 */
const isSilentCatch = (clause: ts.CatchClause): boolean => {
	let observable = false;
	const walk = (node: ts.Node): void => {
		if (ts.isThrowStatement(node) || ts.isCallExpression(node) || ts.isNewExpression(node))
			observable = true;
		if (!observable) ts.forEachChild(node, walk);
	};
	ts.forEachChild(clause.block, walk);
	return !observable;
};

for (const file of files) {
	const sourceText = readFileSync(resolve(root, file), 'utf8');
	const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);

	const visit = (node: ts.Node): void => {
		const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
		if (isShapeCast(node) && !allowed('shape-cast', sourceText, line))
			shapeCastExceptions.push(`${file}:${line} asserts a type onto an object literal`);
		if (ts.isCatchClause(node) && isSilentCatch(node) && !allowed('silent-catch', sourceText, line))
			silentCatchExceptions.push(`${file}:${line} catch swallows without reporting`);
		ts.forEachChild(node, visit);
	};
	visit(source);
}

const report = (label: string, entries: string[], limit: number): void => {
	if (entries.length > 0)
		process.stderr.write(
			`${label} (${entries.length}, baseline ${limit}):\n${entries.join('\n')}\n`
		);
	if (entries.length > limit)
		failures.push(`${label} increased from the ${limit}-site baseline to ${entries.length}`);
};

report('Object-literal type assertions', shapeCastExceptions, shapeCastLimit);
report('Silent catch clauses', silentCatchExceptions, silentCatchLimit);

if (failures.length > 0) {
	process.stderr.write(`\nSource audit failed:\n- ${failures.join('\n- ')}\n`);
	process.exit(1);
}

process.stdout.write(
	`Source audit passed for ${files.length} files. ` +
		`Baselines: ${shapeCastExceptions.length} object-literal casts, ` +
		`${silentCatchExceptions.length} silent catches.\n`
);
