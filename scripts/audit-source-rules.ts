import ts from 'typescript';
export type SourceRule = 'shape-cast' | 'silent-catch';
export interface SourceViolation {
	readonly rule: SourceRule;
	readonly line: number;
	readonly message: string;
}
const allowance = /^\s*\/\/\s*audit-allow:\s*([a-z-]+)\s+—\s+(\S.*)\s*$/;
const unwrap = (value: ts.Expression): ts.Expression => {
	let current = value;
	while (ts.isParenthesizedExpression(current)) current = current.expression;
	return current;
};
const shapeCast = (node: ts.Node): node is ts.AsExpression | ts.TypeAssertion =>
	(ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
	node.type.getText() !== 'const' &&
	(ts.isObjectLiteralExpression(unwrap(node.expression)) ||
		(node.type.kind === ts.SyntaxKind.NeverKeyword &&
			!ts.isPropertyAccessExpression(unwrap(node.expression)) &&
			!ts.isElementAccessExpression(unwrap(node.expression))) ||
		(node.type.kind === ts.SyntaxKind.UnknownKeyword &&
			(ts.isAsExpression(node.parent) || ts.isTypeAssertionExpression(node.parent))));
const explicitFailureResult = (node: ts.ReturnStatement): boolean => {
	const expression = node.expression && unwrap(node.expression);
	if (!expression || !ts.isObjectLiteralExpression(expression)) return false;
	return expression.properties.some((field) => {
		if (!ts.isPropertyAssignment(field) || !ts.isIdentifier(field.name)) return false;
		if (field.name.text === 'ok') return field.initializer.kind === ts.SyntaxKind.FalseKeyword;
		return (
			field.name.text === 'kind' &&
			(ts.isStringLiteral(field.initializer) ||
				ts.isNoSubstitutionTemplateLiteral(field.initializer)) &&
			['corrupt', 'error', 'failure'].includes(field.initializer.text)
		);
	});
};
const recovers = (node: ts.Node): boolean => {
	let found = false;
	const visit = (child: ts.Node): void => {
		if (child !== node && ts.isFunctionLike(child)) return;
		if (ts.isThrowStatement(child) || (ts.isReturnStatement(child) && explicitFailureResult(child)))
			found = true;
		if (!found) ts.forEachChild(child, visit);
	};
	visit(node);
	return found;
};
const rejectionHandler = (node: ts.CallExpression): ts.Expression | undefined => {
	if (!ts.isPropertyAccessExpression(node.expression)) return undefined;
	if (node.expression.name.text === 'catch') return node.arguments[0];
	if (node.expression.name.text === 'then') return node.arguments[1];
	return undefined;
};
export const analyzeSource = (fileName: string, text: string): readonly SourceViolation[] => {
	const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
	const lines = text.split('\n');
	const used = new Set<number>();
	const violations: SourceViolation[] = [];
	const report = (rule: SourceRule, node: ts.Node, message: string): void => {
		const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
		for (const candidate of [line - 1, line]) {
			const match = allowance.exec(lines[candidate - 1] ?? '');
			if (match?.[1] === rule) {
				used.add(candidate);
				return;
			}
		}
		violations.push({ rule, line, message });
	};
	const visit = (node: ts.Node): void => {
		if (shapeCast(node)) report('shape-cast', node, 'asserts a type onto an object literal');
		if (ts.isCatchClause(node) && !recovers(node.block))
			report('silent-catch', node, 'catch absorbs a failure');
		if (ts.isCallExpression(node)) {
			const handler = rejectionHandler(node);
			if (
				handler &&
				(ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) &&
				!recovers(handler.body)
			)
				report('silent-catch', node, 'Promise rejection handler absorbs a failure');
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	for (const [index, line] of lines.entries())
		if (line.includes('audit-allow:')) {
			const lineNumber = index + 1;
			const match = allowance.exec(line);
			if (!match || !['shape-cast', 'silent-catch'].includes(match[1] ?? ''))
				violations.push({
					rule: 'silent-catch',
					line: lineNumber,
					message: 'malformed audit allowance'
				});
			else if (!used.has(lineNumber))
				violations.push({
					rule: match[1] as SourceRule,
					line: lineNumber,
					message: 'stale audit allowance'
				});
		}
	return violations;
};
