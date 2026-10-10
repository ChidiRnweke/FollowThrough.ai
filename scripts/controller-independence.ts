import { dirname, posix } from 'node:path';
import ts from 'typescript';

const controller = (file: string): boolean =>
	/^src\/lib\/(?:server\/)?controllers\//.test(file) && !/\.spec\.ts$/.test(file);

/** Resolve aliases and export barrels; type-only dependencies obey the same boundary. */
export function controllerImportViolations(files: ReadonlyMap<string, string>): readonly string[] {
	const parsed = new Map(
		[...files].map(([file, source]) => [
			file,
			ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
		])
	);
	const resolveModule = (file: string, specifier: string): string | undefined => {
		const base = specifier.startsWith('$lib/')
			? 'src/lib/' + specifier.slice(5)
			: specifier.startsWith('.')
				? posix.normalize(posix.join(dirname(file), specifier))
				: specifier;
		return [base, base + '.ts', base + '/index.ts'].find((candidate) => files.has(candidate));
	};
	const origins = (file: string, seen = new Set<string>()): readonly string[] => {
		if (seen.has(file)) return [];
		seen.add(file);
		if (controller(file)) return [file];
		const source = parsed.get(file);
		if (!source) return [];
		return source.statements.flatMap((statement) => {
			if (
				!ts.isExportDeclaration(statement) ||
				!statement.moduleSpecifier ||
				!ts.isStringLiteral(statement.moduleSpecifier)
			)
				return [];
			const target = resolveModule(file, statement.moduleSpecifier.text);
			return target ? origins(target, seen) : [];
		});
	};
	const failures: string[] = [];
	for (const [file, source] of parsed) {
		if (!controller(file)) continue;
		const visit = (node: ts.Node): void => {
			const specifier =
				ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
					? node.moduleSpecifier
					: ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
						? node.argument.literal
						: ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
							? node.arguments[0]
							: undefined;
			if (specifier && ts.isStringLiteral(specifier)) {
				const target = resolveModule(file, specifier.text);
				for (const origin of target ? origins(target) : []) {
					if (origin !== file)
						failures.push(
							`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} imports another controller (${origin})`
						);
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	return [...new Set(failures)].sort();
}
