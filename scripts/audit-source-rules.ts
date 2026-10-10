import ts from 'typescript';
/**
 * Every landed rule, in one place.
 *
 * The union and the stale-allowance sweep both need this list, and they used to
 * hold a copy each — so adding a rule to one and not the other made every
 * `audit-allow` for the new rule report as malformed, which is a failure that
 * points at the wrong file.
 */
const RULES = [
	'model-procedure',
	'model-state',
	'tool-boundary',
	'shape-cast',
	'silent-catch',
	'no-instanceof-models',
	'no-response-json-cast',
	'no-zod-unknown',
	'no-weak-record-guard',
	'no-record-unknown',
	'no-json-parse-cast',
	'no-cast-probe',
	'no-unknown-type'
] as const;
export type SourceRule = (typeof RULES)[number];
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
/** Model callables construct schemas or records; calculations belong to services. */
const schemaExpression = (expression: ts.Expression): boolean => {
	let value = unwrap(expression);
	while (ts.isCallExpression(value) || ts.isPropertyAccessExpression(value)) {
		if (ts.isCallExpression(value)) {
			if (
				ts.isPropertyAccessExpression(value.expression) &&
				['parse', 'safeParse', 'parseAsync', 'safeParseAsync'].includes(value.expression.name.text)
			)
				return false;
			value = value.expression;
		} else value = value.expression;
	}
	return ts.isIdentifier(value) && value.text === 'z';
};
const dataExpression = (expression: ts.Expression): boolean => {
	const value = unwrap(expression);
	if (
		ts.isIdentifier(value) ||
		ts.isLiteralExpression(value) ||
		value.kind === ts.SyntaxKind.TrueKeyword ||
		value.kind === ts.SyntaxKind.FalseKeyword ||
		value.kind === ts.SyntaxKind.NullKeyword
	)
		return true;
	if (ts.isArrayLiteralExpression(value)) return value.elements.every(dataExpression);
	if (!ts.isObjectLiteralExpression(value)) return false;
	return value.properties.every(
		(property) =>
			ts.isShorthandPropertyAssignment(property) ||
			(ts.isPropertyAssignment(property) &&
				!ts.isComputedPropertyName(property.name) &&
				dataExpression(property.initializer))
	);
};
/** Scalar constructors may validate and spell a branded value, but cannot consult collaborators. */
const valueConstructor = (
	callable: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression
): boolean => {
	if (!callable.type || !ts.isTypeReferenceNode(callable.type) || !callable.body) return false;
	const name = callable.type.typeName.getText();
	const declaration = callable
		.getSourceFile()
		.statements.find(
			(statement): statement is ts.TypeAliasDeclaration =>
				ts.isTypeAliasDeclaration(statement) && statement.name.text === name
		);
	if (!declaration || !ts.isIntersectionTypeNode(declaration.type)) return false;
	const scalar = declaration.type.types.find((type) =>
		[
			ts.SyntaxKind.StringKeyword,
			ts.SyntaxKind.NumberKeyword,
			ts.SyntaxKind.BigIntKeyword
		].includes(type.kind)
	);
	const brand = declaration.type.types.find(
		(type) =>
			ts.isTypeLiteralNode(type) &&
			type.members.length === 1 &&
			type.members.every(
				(member) =>
					ts.isPropertySignature(member) &&
					member.name.getText() === '__brand' &&
					member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) &&
					member.type &&
					ts.isLiteralTypeNode(member.type) &&
					ts.isStringLiteral(member.type.literal)
			)
	);
	if (!scalar || !brand || declaration.type.types.length !== 2) return false;
	const locals = new Set<string>();
	for (const parameter of callable.parameters) {
		if (
			!ts.isIdentifier(parameter.name) ||
			!parameter.type ||
			![
				ts.SyntaxKind.StringKeyword,
				ts.SyntaxKind.NumberKeyword,
				ts.SyntaxKind.BigIntKeyword
			].includes(parameter.type.kind)
		)
			return false;
		locals.add(parameter.name.text);
	}
	const expression = (input: ts.Expression): boolean => {
		const value = unwrap(input);
		if (ts.isIdentifier(value)) return locals.has(value.text);
		if (ts.isLiteralExpression(value)) return true;
		if (ts.isAsExpression(value))
			return value.type.getText() === name && expression(value.expression);
		if (ts.isTemplateExpression(value))
			return value.templateSpans.every((span) => expression(span.expression));
		if (ts.isBinaryExpression(value))
			return (
				!(
					value.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
					value.operatorToken.kind <= ts.SyntaxKind.LastAssignment
				) &&
				expression(value.left) &&
				expression(value.right)
			);
		if (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression)) {
			const receiver = value.expression.expression;
			return (
				ts.isIdentifier(receiver) &&
				locals.has(receiver.text) &&
				['indexOf', 'includes', 'slice', 'trim', 'toLowerCase', 'toUpperCase', 'toString'].includes(
					value.expression.name.text
				) &&
				value.arguments.every(expression)
			);
		}
		return false;
	};
	if (
		callable.parameters.some(
			(parameter) => parameter.initializer && !expression(parameter.initializer)
		)
	)
		return false;
	const statement = (node: ts.Statement): boolean => {
		if (ts.isBlock(node)) return node.statements.every(statement);
		if (ts.isReturnStatement(node)) return !!node.expression && expression(node.expression);
		if (ts.isIfStatement(node))
			return (
				expression(node.expression) &&
				statement(node.thenStatement) &&
				(!node.elseStatement || statement(node.elseStatement))
			);
		if (ts.isThrowStatement(node))
			return (
				ts.isNewExpression(node.expression) &&
				ts.isIdentifier(node.expression.expression) &&
				node.expression.expression.text === 'Error' &&
				!!node.expression.arguments?.every(expression)
			);
		if (ts.isVariableStatement(node) && (node.declarationList.flags & ts.NodeFlags.Const) !== 0) {
			return node.declarationList.declarations.every((local) => {
				if (!ts.isIdentifier(local.name) || !local.initializer || !expression(local.initializer))
					return false;
				locals.add(local.name.text);
				return true;
			});
		}
		return false;
	};
	return ts.isBlock(callable.body) ? statement(callable.body) : expression(callable.body);
};
const modelProcedure = (node: ts.Node): boolean => {
	let callable: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
	if (ts.isFunctionDeclaration(node) && ts.isSourceFile(node.parent)) callable = node;
	else if (
		ts.isVariableDeclaration(node) &&
		node.initializer &&
		(ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
		ts.isVariableDeclarationList(node.parent) &&
		ts.isVariableStatement(node.parent.parent) &&
		ts.isSourceFile(node.parent.parent.parent)
	)
		callable = node.initializer;
	else return false;
	if (valueConstructor(callable)) return false;
	const body = callable.body;
	if (!body) return false;
	let expression: ts.Expression | undefined;
	if (ts.isBlock(body)) {
		const last = body.statements.at(-1);
		const schemaLocals = body.statements
			.slice(0, -1)
			.every(
				(statement) =>
					ts.isVariableStatement(statement) &&
					(statement.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
					statement.declarationList.declarations.every(
						(declaration) => declaration.initializer && schemaExpression(declaration.initializer)
					)
			);
		if (schemaLocals && last && ts.isReturnStatement(last)) expression = last.expression;
	} else expression = body;
	return (
		!expression ||
		!(
			schemaExpression(expression) ||
			(ts.isObjectLiteralExpression(unwrap(expression)) && dataExpression(expression))
		)
	);
};
const modelState = (node: ts.Node): boolean =>
	ts.isClassDeclaration(node) ||
	(ts.isVariableStatement(node) &&
		ts.isSourceFile(node.parent) &&
		(node.declarationList.flags & ts.NodeFlags.Const) === 0);
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
const isCast = (node: ts.Node): node is ts.AsExpression | ts.TypeAssertion =>
	ts.isAsExpression(node) || ts.isTypeAssertionExpression(node);
const jsonParseCall = (node: ts.Node): boolean =>
	ts.isCallExpression(node) &&
	ts.isPropertyAccessExpression(node.expression) &&
	ts.isIdentifier(node.expression.expression) &&
	node.expression.expression.text === 'JSON' &&
	node.expression.name.text === 'parse';
const honestUnknown = (type: ts.TypeNode | undefined): boolean =>
	type?.kind === ts.SyntaxKind.UnknownKeyword;
const enclosingReturnType = (node: ts.Node): ts.TypeNode | undefined => {
	let current: ts.Node | undefined = node.parent;
	while (current) {
		if (ts.isFunctionLike(current)) return current.type;
		current = current.parent;
	}
	return undefined;
};
/** The type an expression is handed to, in each position where a human wrote one down. */
const declaredTarget = (node: ts.Node): ts.TypeNode | undefined => {
	let current: ts.Node = node;
	while (current.parent && ts.isParenthesizedExpression(current.parent)) current = current.parent;
	const parent: ts.Node | undefined = current.parent;
	if (!parent) return undefined;
	if (isCast(parent) && parent.expression === current) return parent.type;
	if (
		(ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent)) &&
		parent.initializer === current
	)
		return parent.type;
	if (ts.isArrowFunction(parent) && parent.body === current) return parent.type;
	if (ts.isReturnStatement(parent)) return enclosingReturnType(parent);
	return undefined;
};
/**
 * A `JSON.parse` result given a type nothing checked.
 *
 * `JSON.parse` returns `any`, so every way of naming its result is an assertion.
 * The rule catches all three ways this codebase has written one: the cast, the
 * annotated declaration, and the annotated return position. The annotated forms
 * are not a stretch — `evals/lab/pglite-database.ts` carries a comment calling
 * its old `const journal: MigrationJournal = JSON.parse(…)` "an assertion
 * wearing a costume", and it checked exactly as much as the cast does.
 *
 * `as unknown`, `: unknown`, and a bare result handed straight to a schema are
 * the honest forms and stay legal. That exemption is load-bearing:
 * `models/agent/tool-failure.ts` and `services/agent/conversations/replay-virtualizer.ts`
 * are the two sites docs/architecture/type-narrowing.md §5 holds up as correct.
 *
 * Reported at the `JSON.parse` call, never at whatever named its result. That is
 * not cosmetic: an `audit-allow` has to sit on the line above the one reported,
 * and reporting the enclosing function would put the violation on its signature
 * line, where no comment can precede the parse. The call is the one node present
 * in all three positions.
 */
const jsonParseCast = (node: ts.Node): boolean => {
	if (!jsonParseCall(node)) return false;
	const target = declaredTarget(node);
	return target !== undefined && !honestUnknown(target);
};
/**
 * A cast onto an inline object type — the mirror of `shape-cast`, which owns
 * the object-literal side.
 *
 * The union arm is not defensive. `note-reading-stats.svelte` casts to
 * `{ words: () => number } | undefined`, and without it `| undefined` would be
 * the one-character way to spell a probe the rule cannot see.
 *
 * A mapped type (`as { [P in K]?: V }`) and an array of type literals
 * (`[] as { pos: number }[]`) are different shapes and do not fire: neither
 * asserts an unverified shape onto a foreign value. The first is a generic
 * helper naming its own result, the second seeds an empty accumulator.
 */
const castProbe = (node: ts.Node): boolean => {
	if (!isCast(node) || ts.isObjectLiteralExpression(unwrap(node.expression))) return false;
	if (ts.isTypeLiteralNode(node.type)) return true;
	return (
		ts.isUnionTypeNode(node.type) && node.type.types.some((type) => ts.isTypeLiteralNode(type))
	);
};
/** `Record<string, unknown>`, `Record<string, any>`, or `{ [k: string]: unknown }`. */
const weakRecordType = (node: ts.TypeNode): boolean => {
	const weakValue = (type: ts.TypeNode | undefined): boolean =>
		type?.kind === ts.SyntaxKind.UnknownKeyword || type?.kind === ts.SyntaxKind.AnyKeyword;
	if (ts.isTypeReferenceNode(node))
		return (
			ts.isIdentifier(node.typeName) &&
			node.typeName.text === 'Record' &&
			node.typeArguments?.length === 2 &&
			weakValue(node.typeArguments[1])
		);
	if (!ts.isTypeLiteralNode(node)) return false;
	return (
		node.members.length > 0 &&
		node.members.every((member) => ts.isIndexSignatureDeclaration(member) && weakValue(member.type))
	);
};
/**
 * `Record<string, unknown|any>`, `{ [k: string]: unknown|any }`, or either
 * wrapped in `Readonly<…>` — the open-keyed struct substitute TN-50 bans.
 *
 * The category-rule and the guard-rule share `weakRecordType` because they
 * attack the same shape in two positions: the guard declares a predicate
 * narrowing to it, and this one names it as a field, parameter, or return. A
 * `Readonly` wrapper is the same shape in a second coat — the majority of the
 * baseline was `Readonly<Record<string, unknown>>` — so it must be unwrapped
 * before checking, or renaming the wrapper would evade the rule the way a
 * rename evades nothing else here.
 */
const weakRecordTypeRef = (node: ts.TypeNode): boolean => {
	if (ts.isTypeReferenceNode(node)) {
		if (
			ts.isIdentifier(node.typeName) &&
			node.typeName.text === 'Readonly' &&
			node.typeArguments?.length === 1
		)
			return weakRecordTypeRef(node.typeArguments[0]);
		return weakRecordType(node);
	}
	return weakRecordType(node);
};

/**
 * A predicate that claims to narrow `unknown` into an open-keyed record.
 *
 * Detected by its signature and never by its name. The four copies in the chat
 * surfaces were all called `isRecord`, but the fifth was `isPlainObject` and had
 * the identical body — a name-based check reported a baseline of four and would
 * have failed on the fifth the moment the rule landed.
 *
 * Narrowing to a concrete type is not this: a predicate answering `value is
 * AgentPayloadObject` picks a member out of a union that already holds. What this
 * catches is the shape that turns a compile-time guarantee into runtime hope,
 * because everything after it still has to probe.
 */
const weakRecordGuard = (node: ts.Node): boolean => {
	if (
		!ts.isFunctionDeclaration(node) &&
		!ts.isArrowFunction(node) &&
		!ts.isFunctionExpression(node) &&
		!ts.isMethodDeclaration(node)
	)
		return false;
	return (
		node.type !== undefined && ts.isTypePredicateNode(node.type) && weakRecordType(node.type.type!)
	);
};
/**
 * The three layers ADR 0037 keeps total: everything inward of a parse zone.
 *
 * Scoped by path the way `no-instanceof-models` is, and for the same reason —
 * the pattern is not wrong everywhere. `unknown` at a remote function, a DB
 * mapper, or a client storage reader is the honest type of data nobody has
 * parsed yet, and those files are the ones whose job is to parse it.
 */
const STRICT_LAYERS = [
	'src/lib/models/',
	'src/lib/services/',
	'src/lib/controllers/',
	'src/lib/server/services/',
	'src/lib/server/controllers/'
] as const;
const strictLayer = (fileName: string): boolean =>
	STRICT_LAYERS.some((layer) => fileName.startsWith(layer));
/**
 * `unknown` in a position some other piece of code has to read: a parameter, a
 * return type, a field, a type alias, or any of those reached through a union,
 * an array, `readonly`, or a generic argument.
 *
 * Two positions are excluded, and neither is a softening — landing the rule
 * without them would break two rules that already shipped.
 *
 * A **cast target** is excluded because `x as unknown` is the form §5 and §6 of
 * the catalog hold up as *correct*, and `shape-cast` already owns the double
 * cast. The exclusion sweeps the whole ancestor chain rather than the immediate
 * parent, because a cast target can be a whole signature:
 * `descriptor.value as (...args: unknown[]) => unknown` puts one `unknown` in a
 * parameter of a type nobody declared, and stopping at that parameter would
 * report the one spelling the catalog blesses.
 *
 * A **local variable annotation** is excluded because `no-json-parse-cast`
 * blesses `const parsed: unknown = JSON.parse(text)` by name, and its spec pins
 * it. A local `unknown` has no consumers to mislead: the next line narrows it.
 */
const insideCastTarget = (node: ts.Node): boolean => {
	let current: ts.Node | undefined = node;
	while (current.parent) {
		if (isCast(current.parent) && current.parent.type === current) return true;
		current = current.parent;
	}
	return false;
};
const unknownTypePosition = (node: ts.Node): boolean => {
	if (node.kind !== ts.SyntaxKind.UnknownKeyword || insideCastTarget(node)) return false;
	let current: ts.Node = node;
	while (current.parent && ts.isTypeNode(current.parent)) current = current.parent;
	const parent: ts.Node | undefined = current.parent;
	if (!parent || ts.isVariableDeclaration(parent)) return false;
	if (ts.isParameter(parent) || ts.isTypeAliasDeclaration(parent)) return true;
	if (ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent)) return true;
	return ts.isFunctionLike(parent) && parent.type === current;
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
		// A `Readonly<Record<string, unknown>>` matches both at the wrapper and at
		// its type argument — one violation per rule and line is the report.
		if (violations.some((v) => v.rule === rule && v.line === localLine + lineOffset)) return;
		violations.push({ rule, line: localLine + lineOffset, message });
	};
	const sdkAdapter = 'src/lib/server/adapters/agent/sdk-tool.ts';
	const mcpAdapter = 'src/lib/server/factories/agent/mcp-tool-factory.ts';
	const diagramProtocol = 'src/lib/server/adapters/diagrams/generation.ts';
	const toolBoundaryImport = (node: ts.Node): boolean => {
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			const clause = node.importClause;
			if (!clause || clause.isTypeOnly) return false;
			const module = node.moduleSpecifier.text;
			const bindings = clause.namedBindings;
			if (module.startsWith('@modelcontextprotocol/sdk/server/')) {
				return (
					fileName !== mcpAdapter &&
					!!bindings &&
					(ts.isNamespaceImport(bindings) ||
						bindings.elements.some(
							(binding) =>
								!binding.isTypeOnly &&
								['Server', 'McpServer'].includes(binding.propertyName?.text ?? binding.name.text)
						))
				);
			}
			if (module !== '@openai/agents' && module !== '@openai/agents-core') return false;
			if (fileName === sdkAdapter || fileName === diagramProtocol) return false;
			return (
				!!bindings &&
				(ts.isNamespaceImport(bindings) ||
					bindings.elements.some(
						(binding) =>
							!binding.isTypeOnly && (binding.propertyName?.text ?? binding.name.text) === 'tool'
					))
			);
		}
		if (
			ts.isExportDeclaration(node) &&
			!node.isTypeOnly &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			const module = node.moduleSpecifier.text;
			if (
				module !== '@openai/agents' &&
				module !== '@openai/agents-core' &&
				!module.startsWith('@modelcontextprotocol/sdk/server/')
			)
				return false;
			return (
				!node.exportClause ||
				ts.isNamespaceExport(node.exportClause) ||
				node.exportClause.elements.some(
					(binding) =>
						!binding.isTypeOnly &&
						['tool', 'Server', 'McpServer'].includes(
							binding.propertyName?.text ?? binding.name.text
						)
				)
			);
		}
		return false;
	};
	const visit = (node: ts.Node): void => {
		if (fileName.startsWith('src/lib/models/')) {
			if (modelProcedure(node))
				report(
					'model-procedure',
					node,
					'implements a procedure instead of constructing data or a Zod schema'
				);
			if (modelState(node))
				report('model-state', node, 'declares runtime state or a class in a model');
		}
		if (toolBoundaryImport(node))
			report(
				'tool-boundary',
				node,
				'constructs or re-exports tools outside the designated protocol adapter'
			);
		if (shapeCast(node)) report('shape-cast', node, 'asserts a type onto an object literal');
		if (responseJsonCast(node))
			report('no-response-json-cast', node, 'casts a response JSON result without parsing it');
		if (jsonParseCast(node))
			report('no-json-parse-cast', node, 'names a JSON.parse result without parsing it');
		if (castProbe(node))
			report('no-cast-probe', node, 'asserts an inline object shape onto a value');
		if (weakZodCall(node))
			report('no-zod-unknown', node, 'uses a non-narrowing Zod unknown or any schema');
		if (weakRecordGuard(node))
			report('no-weak-record-guard', node, 'narrows to an open-keyed record instead of a type');
		if (ts.isTypeNode(node) && weakRecordTypeRef(node))
			report(
				'no-record-unknown',
				node,
				'uses an open-keyed record of unknown as a struct substitute'
			);
		if (strictLayer(fileName) && unknownTypePosition(node))
			report('no-unknown-type', node, 'leaves unknown on a type inward of a parse zone');
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
			if (!match || !RULES.includes((match[1] ?? '') as SourceRule))
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
