import { parse, type AST } from 'svelte/compiler';
import ts from 'typescript';

type Expression = AST.ExpressionTag['expression'];
export type SurfaceTextFinding = {
	file: string;
	line: number;
	kind: 'markup' | 'class-recipe' | 'css';
	surface: string;
	text: string;
	state: string;
	evidence: string;
	unresolved: string[];
};
export type SurfaceTextReport = { findings: SurfaceTextFinding[]; unresolved: string[] };
type Context = {
	surface: string;
	text: string;
	state: string;
	opacity: string[];
	unresolved: string[];
};
const empty: Context = { surface: '', text: '', state: 'base', opacity: [], unresolved: [] };
const colored = /^bg-(?:brand|primary|destructive|success|warning|info)(?:\/[^\s]+)?$/;
const neutral = /^bg-(?:background|card|popover|muted|secondary|accent|sidebar)$/;
const suspect =
	/^text-(?:muted-foreground|(?:gray|slate|zinc|neutral|stone)-\d+)(?:\/[^\s]+)?$|^text-[\w-]+\/(?!100$)[\d.]+$/;
const foreground =
	/^text-(?:[a-z]+(?:-[a-z]+)*|(?:gray|slate|zinc|neutral|stone)-\d+)(?:\/[^\s]+)?$/;
const sizes =
	/^text-(?:xs|sm|base|lg|xl|\d+xl|left|right|center|justify|wrap|nowrap|balance|pretty)$/;

function combine(left: string[], right: string[]): string[] {
	return left.flatMap((a) => right.map((b) => `${a} ${b}`.trim()));
}

/** Evaluate only class structure, never user code. Branches remain separate. */
function expressionClasses(
	node: Expression,
	bindings: Map<string, Expression> = new Map(),
	resolving: Set<string> = new Set()
): string[] {
	const evaluate = (expression: Expression) => expressionClasses(expression, bindings, resolving);
	if (node.type === 'Identifier') {
		const binding = bindings.get(node.name);
		if (!binding || resolving.has(node.name)) return [''];
		return expressionClasses(binding, bindings, new Set([...resolving, node.name]));
	}
	if (node.type === 'ArrayExpression')
		return node.elements.reduce<string[]>(
			(items, element) =>
				!element || element.type === 'SpreadElement' ? items : combine(items, evaluate(element)),
			['']
		);
	if (node.type === 'Literal') return typeof node.value === 'string' ? [node.value] : [''];
	if (node.type === 'ConditionalExpression')
		return [...evaluate(node.consequent), ...evaluate(node.alternate)];
	if (node.type === 'LogicalExpression') return ['', ...evaluate(node.right)];
	if (node.type === 'TemplateLiteral') {
		let alternatives = [''];
		for (let index = 0; index < node.quasis.length; index++) {
			alternatives = alternatives.map((item) => item + node.quasis[index].value.raw);
			const expression = node.expressions[index];
			if (expression) alternatives = combine(alternatives, evaluate(expression));
		}
		return alternatives;
	}
	if (
		node.type === 'CallExpression' &&
		node.callee.type === 'Identifier' &&
		['cn', '$derived'].includes(node.callee.name)
	)
		return node.arguments.reduce<string[]>(
			(items, argument) =>
				argument.type === 'SpreadElement' ? items : combine(items, evaluate(argument)),
			['']
		);
	return [''];
}

function classAlternatives(
	element: AST.BaseElement,
	bindings: Map<string, Expression>
): { values: string[]; dynamic: boolean } {
	const attribute = element.attributes.find(
		(item): item is AST.Attribute => item.type === 'Attribute' && item.name === 'class'
	);
	if (!attribute || attribute.value === true) return { values: [''], dynamic: false };
	const parts = Array.isArray(attribute.value) ? attribute.value : [attribute.value];
	return {
		values: parts.reduce<string[]>(
			(items, part) =>
				combine(
					items,
					part.type === 'Text' ? [part.data] : expressionClasses(part.expression, bindings)
				),
			['']
		),
		dynamic: parts.some((part) => part.type === 'ExpressionTag')
	};
}

export function surfaceTextUtilities(css: string): Map<string, string> {
	const utilities = new Map<string, string>();
	for (const match of css.matchAll(/(?:@utility\s+|\.)([\w-]+)\s*\{([^{}]*)\}/g)) {
		const apply = match[2].match(/@apply\s+([^;]+)/)?.[1];
		if (apply) utilities.set(match[1], apply);
	}
	return utilities;
}

function contexts(
	classes: string,
	inherited: Context,
	utilities: Map<string, string> = new Map()
): Context[] {
	classes = classes
		.split(/\s+/)
		.map((token) => utilities.get(token) ?? token)
		.join(' ');
	const tokens = classes
		.split(/\s+/)
		.filter((token) => token && !token.includes('&') && !token.includes('*'));
	const states = new Set(['base']);
	for (const token of tokens)
		if (token.includes(':') && /(?:bg-|text-|opacity-)/.test(token))
			states.add(token.slice(0, token.lastIndexOf(':')));
	if (tokens.some((token) => token.startsWith('placeholder:'))) {
		for (const state of [...states])
			if (state !== 'base' && !state.includes('placeholder')) states.add(`${state}:placeholder`);
	}
	return [...states].map((state) => {
		const result: Context = {
			...inherited,
			state: state === 'base' ? inherited.state : state,
			opacity: [...inherited.opacity],
			unresolved: [...new Set(inherited.unresolved)]
		};
		let localOpacity = '';
		for (const token of [...tokens].sort((a, b) => a.split(':').length - b.split(':').length)) {
			const separator = token.lastIndexOf(':');
			const qualifier = separator < 0 ? 'base' : token.slice(0, separator);
			if (
				qualifier !== 'base' &&
				qualifier !== state &&
				!state.endsWith(`:${qualifier}`) &&
				!state.startsWith(`${qualifier}:`)
			)
				continue;
			const utility = token.slice(separator + 1);
			if (/^opacity-\d+$/.test(utility)) localOpacity = token;
			if (colored.test(utility)) result.surface = utility;
			else if (neutral.test(utility)) result.surface = '';
			if (foreground.test(utility) && !sizes.test(utility)) result.text = utility;
		}
		if (localOpacity && !localOpacity.endsWith('opacity-100')) {
			result.opacity.push(localOpacity);
			result.unresolved.push(
				/disabled/.test(localOpacity)
					? 'Disabled-state opacity: intentional state treatment, review separately from ordinary text.'
					: tokens.some((token) => /opacity-(?:0|100)$/.test(token))
						? 'Reveal/visibility opacity: review only when visible and settled; do not treat hidden content as a legibility failure.'
						: 'Text or ancestor opacity reduces the whole composited element; verify its visible state.'
			);
		}
		return result;
	});
}

export function scanSurfaceText(
	file: string,
	source: string,
	utilities: Map<string, string> = new Map()
): SurfaceTextReport {
	const findings: SurfaceTextFinding[] = [];
	const unresolved = new Set<string>();
	const line = (offset: number) => source.slice(0, offset).split('\n').length;
	const add = (
		offset: number,
		kind: SurfaceTextFinding['kind'],
		context: Context,
		evidence: string
	) => {
		if (!context.surface || (!suspect.test(context.text) && context.opacity.length === 0)) return;
		const { opacity, ...details } = context;
		findings.push({
			file,
			line: line(offset),
			kind,
			...details,
			text: opacity.length
				? [context.text || 'inherited foreground', ...opacity].join(' + ')
				: context.text,
			evidence: evidence.trim().replace(/\s+/g, ' ')
		});
	};
	const scanRecipes = (recipeSource: string, offset: number) => {
		const root = ts.createSourceFile(file, recipeSource, ts.ScriptTarget.Latest, true);
		const visit = (node: ts.Node) => {
			if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
				for (const context of contexts(node.text, empty, utilities))
					add(
						offset + node.getStart(root),
						'class-recipe',
						{
							...context,
							unresolved: [
								...context.unresolved,
								'Class recipe: confirm this string is rendered on a text-bearing element.'
							]
						},
						node.text
					);
			ts.forEachChild(node, visit);
		};
		visit(root);
	};

	if (file.endsWith('.svelte')) {
		const root = parse(source, { modern: true, filename: file });
		const icons = new Set<string>();
		const bindings = new Map<string, Expression>();
		for (const script of [root.instance, root.module]) {
			if (script) {
				const start = source.indexOf('>', script.start) + 1;
				scanRecipes(source.slice(start, source.lastIndexOf('</script', script.end)), start);
			}
			for (const node of script?.content.body ?? []) {
				const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
				if (declaration?.type === 'VariableDeclaration')
					for (const variable of declaration.declarations) {
						if (variable.id.type === 'Identifier' && variable.init)
							bindings.set(variable.id.name, variable.init);
					}
				if (
					node.type === 'ImportDeclaration' &&
					typeof node.source.value === 'string' &&
					/(?:lucide|components\/icons)/.test(node.source.value)
				) {
					for (const specifier of node.specifiers) icons.add(specifier.local.name);
				}
			}
		}
		const visit = (fragment: AST.Fragment, inherited: Context[]) => {
			for (const node of fragment.nodes) {
				if ('attributes' in node && 'fragment' in node && 'name' in node) {
					const classes = classAlternatives(node, bindings);
					const next = classes.values.flatMap((value) =>
						inherited.flatMap((context) => contexts(value, context, utilities))
					);
					for (const context of next) {
						if (classes.dynamic)
							context.unresolved.push(
								'Dynamic classes: branch conditions and external identifiers need rendered verification.'
							);
						if (node.type === 'Component')
							context.unresolved.push(
								'Component may override classes or render children through a portal.'
							);
					}
					const textBearing =
						icons.has(node.name) ||
						node.name === 'svg' ||
						/^(?:input|textarea|Input|Textarea)$/.test(node.name) ||
						node.fragment.nodes.some(
							(child) =>
								child.type === 'ExpressionTag' ||
								(child.type === 'Text' && child.data.trim().length > 0)
						);
					if (
						textBearing &&
						!classes.values.every((value) => /(?:^|\s)(?:sr-only|hidden)(?:\s|$)/.test(value))
					)
						for (const context of next)
							add(
								node.start,
								'markup',
								context,
								source.slice(node.start, source.indexOf('>', node.start) + 1)
							);
					visit(node.fragment, next);
				} else if (node.type === 'IfBlock') {
					visit(node.consequent, inherited);
					if (node.alternate) visit(node.alternate, inherited);
				} else if (node.type === 'EachBlock' || node.type === 'SnippetBlock') {
					visit(node.body, inherited);
					if (node.type === 'EachBlock' && node.fallback) visit(node.fallback, inherited);
				} else if (node.type === 'AwaitBlock') {
					for (const branch of [node.pending, node.then, node.catch])
						if (branch) visit(branch, inherited);
				} else if ('fragment' in node) visit(node.fragment, inherited);
			}
		};
		visit(root.fragment, [empty]);
		unresolved.add(
			'Component-internal styles, CSS selectors, spread attributes, class directives, external class identifiers, and portals require rendered verification.'
		);
	} else if (file.endsWith('.ts')) {
		scanRecipes(source, 0);
	} else if (file.endsWith('.css')) {
		for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			const body = match[2];
			const surface = body.match(
				/background(?:-color)?\s*:[^;]*(?:var\(--(?:color-)?(?:brand|primary|success|destructive|warning|info)\))[^;]*/
			)?.[0];
			const text = body.match(/(?:^|[;\s])color\s*:\s*var\(--(?:color-)?muted-foreground\)/)?.[0];
			if (surface && text)
				findings.push({
					file,
					line: line(match.index),
					kind: 'css',
					surface,
					text: text.trim(),
					state: match[1].trim(),
					evidence: match[0].trim(),
					unresolved: [
						'CSS inventory: cascade, descendants, and composited colors require rendered verification.'
					]
				});
			for (const apply of body.matchAll(/@apply\s+([^;]+)/g))
				for (const context of contexts(apply[1], empty))
					add(
						match.index,
						'css',
						{
							...context,
							unresolved: ['CSS utility recipe: verify matched elements and cascade.']
						},
						match[0]
					);
		}
		unresolved.add(
			'CSS inventory pairs declarations within leaf rules; it does not resolve selector inheritance or custom-property values.'
		);
	}
	return {
		findings: [...new Map(findings.map((finding) => [JSON.stringify(finding), finding])).values()],
		unresolved: [...unresolved]
	};
}
