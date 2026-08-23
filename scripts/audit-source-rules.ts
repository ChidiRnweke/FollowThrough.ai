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
		(node.type.kind === ts.SyntaxKind.NeverKeyword && ts.isIdentifier(unwrap(node.expression))) ||
		(node.type.kind === ts.SyntaxKind.UnknownKeyword &&
			(ts.isAsExpression(node.parent) || ts.isTypeAssertionExpression(node.parent))));
const assignmentReports = (node: ts.BinaryExpression): boolean => {
	if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
	const name = ts.isPropertyAccessExpression(node.left)
		? node.left.name.text
		: ts.isIdentifier(node.left)
			? node.left.text
			: '';
	if (
		/(?:error|failure|failed|status|connection|cancelling|loading|unavailable|problem)$/i.test(name)
	)
		return true;
	return (
		(ts.isStringLiteral(node.right) || ts.isNoSubstitutionTemplateLiteral(node.right)) &&
		/(?:error|fail|unavailable)/i.test(node.right.text)
	);
};
const returnReports = (node: ts.ReturnStatement): boolean =>
	Boolean(
		node.expression &&
		(node.expression.kind === ts.SyntaxKind.FalseKeyword ||
			(ts.isStringLiteral(node.expression) &&
				/(?:error|fail|unserializable)/i.test(node.expression.text)) ||
			(ts.isObjectLiteralExpression(node.expression) &&
				node.expression.properties.some(
					(field) =>
						ts.isPropertyAssignment(field) &&
						ts.isIdentifier(field.name) &&
						(field.name.text === 'error' ||
							field.name.text === 'failure' ||
							field.name.text === 'problems' ||
							field.name.text === 'raw' ||
							field.name.text === 'status' ||
							(field.name.text === 'ok' && field.initializer.kind === ts.SyntaxKind.FalseKeyword))
				)))
	);
const callReports = (node: ts.CallExpression): boolean => {
	const name = ts.isPropertyAccessExpression(node.expression)
		? node.expression.name.text
		: ts.isIdentifier(node.expression)
			? node.expression.text
			: '';
	if (
		/(?:error|warn|warning|report|capture|notify|toast|announce|invalidate|invalid|unavailable|addIssue|onFailure|setError|fail|failed|reject)$/i.test(
			name
		)
	)
		return true;
	if (
		name === 'push' &&
		ts.isPropertyAccessExpression(node.expression) &&
		/(?:errors?|failures?|failed|problems|skipped)$/i.test(
			ts.isIdentifier(node.expression.expression)
				? node.expression.expression.text
				: ts.isPropertyAccessExpression(node.expression.expression)
					? node.expression.expression.name.text
					: ''
		)
	)
		return true;
	return node.arguments.some((argument) => {
		if (!ts.isObjectLiteralExpression(argument)) return false;
		return argument.properties.some(
			(field) =>
				ts.isPropertyAssignment(field) &&
				ts.isIdentifier(field.name) &&
				(['error', 'failure', 'problems'].includes(field.name.text) ||
					((field.name.text === 'status' || field.name.text.endsWith('Status')) &&
						(ts.isStringLiteral(field.initializer) ||
							ts.isNoSubstitutionTemplateLiteral(field.initializer)) &&
						['error', 'failed', 'failure'].includes(field.initializer.text)))
		);
	});
};
const recovers = (node: ts.Node): boolean => {
	let found = false;
	const visit = (child: ts.Node): void => {
		if (
			ts.isThrowStatement(child) ||
			(ts.isCallExpression(child) && callReports(child)) ||
			(ts.isBinaryExpression(child) && assignmentReports(child)) ||
			(ts.isReturnStatement(child) && returnReports(child))
		)
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
