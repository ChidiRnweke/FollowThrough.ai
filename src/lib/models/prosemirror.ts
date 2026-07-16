export interface ProseMirrorValidationIssue {
	readonly path: string;
	readonly message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const inlineFormattingTypes = new Set([
	'ai-highlight',
	'bold',
	'code',
	'em',
	'highlight',
	'italic',
	'link',
	'strike',
	'strong',
	'subscript',
	'superscript',
	'textStyle',
	'underline'
]);

const validateMark = (value: unknown, path: string): ProseMirrorValidationIssue | undefined => {
	if (!isRecord(value)) return { path, message: 'marks must be objects' };
	if (typeof value.type !== 'string' || !value.type.trim())
		return { path: `${path}.type`, message: 'mark type is required' };
	if (value.attrs !== undefined && !isRecord(value.attrs))
		return { path: `${path}.attrs`, message: 'mark attrs must be an object' };
	return undefined;
};

const validateNode = (value: unknown, path: string): ProseMirrorValidationIssue | undefined => {
	if (!isRecord(value)) return { path, message: 'nodes must be objects' };
	if (typeof value.type !== 'string' || !value.type.trim())
		return { path: `${path}.type`, message: 'node type is required' };
	if (inlineFormattingTypes.has(value.type))
		return {
			path: `${path}.type`,
			message: `${value.type} is inline formatting and cannot be used as a node`
		};
	if (value.attrs !== undefined && !isRecord(value.attrs))
		return { path: `${path}.attrs`, message: 'node attrs must be an object' };
	if (value.text !== undefined && typeof value.text !== 'string')
		return { path: `${path}.text`, message: 'node text must be a string' };
	if (value.type === 'text' && typeof value.text !== 'string')
		return { path: `${path}.text`, message: 'text nodes require text' };
	if (value.type !== 'text' && value.text !== undefined)
		return { path: `${path}.text`, message: 'only text nodes may contain text' };
	if (value.marks !== undefined) {
		if (!Array.isArray(value.marks))
			return { path: `${path}.marks`, message: 'marks must be an array' };
		for (const [index, mark] of value.marks.entries()) {
			const issue = validateMark(mark, `${path}.marks[${index}]`);
			if (issue) return issue;
		}
	}
	if (value.content !== undefined) {
		if (!Array.isArray(value.content))
			return { path: `${path}.content`, message: 'content must be an array' };
		for (const [index, child] of value.content.entries()) {
			const issue = validateNode(child, `${path}.content[${index}]`);
			if (issue) return issue;
		}
	}
	return undefined;
};

export const findProseMirrorDocumentIssue = (
	document: unknown
): ProseMirrorValidationIssue | undefined => {
	const issue = validateNode(document, '$');
	if (issue) return issue;
	if ((document as Record<string, unknown>).type !== 'doc')
		return { path: '$.type', message: 'document root must have type doc' };
	return undefined;
};
