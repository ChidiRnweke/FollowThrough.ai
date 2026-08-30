import ts from 'typescript';
export type SourceRule =
	| 'shape-cast'
	| 'silent-catch'
	| 'no-instanceof-models'
	| 'no-response-json-cast'
	| 'no-zod-unknown';
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
const responseJsonCast = (node: ts.Node): node is ts.AsExpression | ts.TypeAssertion => {
	if (!ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node)) return false;
	if (node.type.kind === ts.SyntaxKind.UnknownKeyword) return false;
	let expression = unwrap(node.expression);
	if (ts.isAwaitExpression(expression)) expression = unwrap(expression.expression);
	return (
		ts.isCallExpression(expression) &&
		ts.isPropertyAccessExpression(expression.expression) &&
		expression.expression.name.text === 'json'
	);
};
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
export const analyzeSource = (
	fileName: string,
	text: string,
	lineOffset = 0
): readonly SourceViolation[] => {
	const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
	const lines = text.split('\n');
	const used = new Set<number>();
	const violations: SourceViolation[] = [];
	const zodNamespaces = new Set<string>();
	const weakZodFunctions = new Set<string>();
	for (const statement of source.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			!ts.isStringLiteral(statement.moduleSpecifier) ||
			statement.moduleSpecifier.text !== 'zod' ||
			!statement.importClause
		)
			continue;
		if (statement.importClause.name) zodNamespaces.add(statement.importClause.name.text);
		const bindings = statement.importClause.namedBindings;
		if (bindings && ts.isNamespaceImport(bindings)) zodNamespaces.add(bindings.name.text);
		if (bindings && ts.isNamedImports(bindings))
			for (const binding of bindings.elements) {
				const importedName = binding.propertyName?.text ?? binding.name.text;
				if (importedName === 'z') zodNamespaces.add(binding.name.text);
				if (importedName === 'unknown' || importedName === 'any')
					weakZodFunctions.add(binding.name.text);
			}
	}
	const weakZodCall = (node: ts.Node): node is ts.CallExpression => {
		if (!ts.isCallExpression(node)) return false;
		if (ts.isIdentifier(node.expression)) return weakZodFunctions.has(node.expression.text);
		return (
			ts.isPropertyAccessExpression(node.expression) &&
			ts.isIdentifier(node.expression.expression) &&
			zodNamespaces.has(node.expression.expression.text) &&
			(node.expression.name.text === 'unknown' || node.expression.name.text === 'any')
		);
	};
	const report = (rule: SourceRule, node: ts.Node, message: string): void => {
		const localLine = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
		for (const candidate of [localLine - 1, localLine]) {
			const match = allowance.exec(lines[candidate - 1] ?? '');
			if (match?.[1] === rule) {
				used.add(candidate);
				return;
			}
		}
		violations.push({ rule, line: localLine + lineOffset, message });
	};
	const visit = (node: ts.Node): void => {
		if (shapeCast(node)) report('shape-cast', node, 'asserts a type onto an object literal');
		if (responseJsonCast(node))
			report('no-response-json-cast', node, 'casts a response JSON result without parsing it');
		if (weakZodCall(node))
			report('no-zod-unknown', node, 'uses a non-narrowing Zod unknown or any schema');
		if (
			fileName.startsWith('src/lib/models/') &&
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword
		)
			report('no-instanceof-models', node, 'uses instanceof in a model');
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
			if (
				!match ||
				![
					'shape-cast',
					'silent-catch',
					'no-instanceof-models',
					'no-response-json-cast',
					'no-zod-unknown'
				].includes(match[1] ?? '')
			)
				violations.push({
					rule: 'silent-catch',
					line: lineNumber + lineOffset,
					message: 'malformed audit allowance'
				});
			else if (!used.has(lineNumber))
				violations.push({
					rule: match[1] as SourceRule,
					line: lineNumber + lineOffset,
					message: 'stale audit allowance'
				});
		}
	return violations;
};
