import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files: string[] = [];
const collect = (directory: string): void => {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) collect(path);
		else if (/\.(?:spec|test)\.ts$|\.e2e\.ts$/.test(entry.name)) files.push(relative(root, path));
	}
};
collect(resolve(root, 'src'));
collect(resolve(root, 'tests'));

const banned = /\b(?:vi|jest)\.(?:mock|fn|spyOn)\s*\(/g;
const failures: string[] = [];
const assertionExceptions: string[] = [];
let testCount = 0;
const legacyAssertionLimit = 30;

const callName = (expression: ts.Expression): string | undefined => {
	if (ts.isIdentifier(expression)) return expression.text;
	if (!ts.isPropertyAccessExpression(expression)) return undefined;
	return `${callName(expression.expression) ?? expression.expression.getText()}.${expression.name.text}`;
};

for (const file of files) {
	const absolute = resolve(root, file);
	const sourceText = readFileSync(absolute, 'utf8');
	const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);

	for (const match of sourceText.matchAll(banned)) {
		const line = source.getLineAndCharacterOfPosition(match.index ?? 0).line + 1;
		failures.push(`${file}:${line} uses a mocking API; inject a hand-written fake`);
	}

	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			const name = callName(node.expression);
			if (name && /^(?:test|it)(?:\.each)?\.skip$/.test(name)) {
				const reason = node.arguments[1];
				if (!reason || !ts.isStringLiteralLike(reason) || reason.text.trim().length === 0) {
					const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
					failures.push(`${file}:${line} skips a test without an explicit reason`);
				}
			}
			if (name && /^(?:test|it)(?:\.each)?$/.test(name)) {
				const callback = node.arguments.find(
					(argument): argument is ts.ArrowFunction | ts.FunctionExpression =>
						ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)
				);
				if (callback) {
					testCount += 1;
					let assertions = 0;
					const count = (child: ts.Node): void => {
						if (
							ts.isCallExpression(child) &&
							(callName(child.expression) === 'expect' ||
								callName(child.expression) === 'expect.element')
						)
							assertions += 1;
						ts.forEachChild(child, count);
					};
					count(callback.body);
					if (!file.endsWith('.e2e.ts') && assertions !== 1) {
						const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
						assertionExceptions.push(`${file}:${line} has ${assertions} assertions`);
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
}

if (assertionExceptions.length > 0) {
	process.stderr.write(
		`Test assertion audit (${assertionExceptions.length} existing cases to consolidate):\n${assertionExceptions.join('\n')}\n`
	);
}
if (assertionExceptions.length > legacyAssertionLimit)
	failures.push(
		`multi-assertion cases increased from the ${legacyAssertionLimit}-case migration baseline to ${assertionExceptions.length}`
	);

if (failures.length > 0) {
	process.stderr.write(`${failures.join('\n')}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(
		`Test quality audit passed for ${files.length} files and ${testCount} declarations; no mocks or unexplained skips.\n`
	);
}
