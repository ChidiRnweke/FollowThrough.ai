/**
 * Structural validation for generated Mermaid.
 *
 * The in-repo renderer only checks that the source starts with a known diagram
 * keyword, which passes for a header followed by nothing usable. These checks go
 * a level deeper while staying grammar-level rather than output-level: they
 * assert properties any valid diagram of that type must have, so a differently
 * but correctly drawn diagram still passes. Anything about whether the diagram
 * is a *good* representation is left to a judge — that is not a syntax question.
 */

const DIAGRAM_TYPES = [
	'flowchart',
	'graph',
	'sequenceDiagram',
	'classDiagram',
	'stateDiagram',
	'stateDiagram-v2',
	'erDiagram',
	'journey',
	'gantt',
	'mindmap',
	'timeline'
];

export interface MermaidVerdict {
	readonly valid: boolean;
	readonly problems: readonly string[];
	readonly diagramType?: string;
	readonly nodeCount: number;
	readonly edgeCount: number;
}

const stripFence = (source: string): string =>
	source
		.replace(/^\s*```(?:mermaid)?\s*/i, '')
		.replace(/```\s*$/, '')
		.trim();

const balanced = (text: string, open: string, close: string): boolean => {
	let depth = 0;
	for (const char of text) {
		if (char === open) depth += 1;
		else if (char === close) depth -= 1;
		if (depth < 0) return false;
	}
	return depth === 0;
};

export function validateMermaid(rawSource: string): MermaidVerdict {
	const source = stripFence(rawSource);
	const problems: string[] = [];

	if (!source) {
		return { valid: false, problems: ['source was empty'], nodeCount: 0, edgeCount: 0 };
	}

	const firstLine = source.split('\n')[0].trim();
	const diagramType = DIAGRAM_TYPES.find((type) => firstLine.startsWith(type));
	if (!diagramType) problems.push(`first line "${firstLine}" is not a known diagram declaration`);

	const body = source
		.split('\n')
		.slice(1)
		.filter((line) => line.trim().length > 0);
	if (body.length === 0) problems.push('declaration has no body');

	// Sequence diagrams use `A->>B: msg`; flow-style use `A --> B`.
	const edgePattern =
		diagramType === 'sequenceDiagram' ? /(->>|-->>|->|-->|-x|--x)/ : /(-->|---|-\.->|==>|--|:::)/;
	const edgeCount = body.filter((line) => edgePattern.test(line)).length;

	// Node-ish lines: an identifier followed by a label or participating in an edge.
	const nodeCount = new Set(
		body
			.flatMap((line) => line.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? [])
			.filter((token) => !['end', 'subgraph', 'participant', 'note', 'over'].includes(token))
	).size;

	if (edgeCount === 0) problems.push('no relationships between elements');
	if (nodeCount < 2) problems.push(`only ${nodeCount} distinct element(s)`);

	if (!balanced(source, '[', ']')) problems.push('unbalanced square brackets');
	if (!balanced(source, '(', ')')) problems.push('unbalanced parentheses');
	if (!balanced(source, '{', '}')) problems.push('unbalanced braces');

	// A stray fence inside the body means the model wrapped prose around it.
	if (source.includes('```')) problems.push('contains a stray code fence');

	return {
		valid: problems.length === 0,
		problems,
		...(diagramType ? { diagramType } : {}),
		nodeCount,
		edgeCount
	};
}
