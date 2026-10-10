import type { SearchMatch } from '$lib/models/knowledge-search';
export const DEFAULT_RERANK_MODEL = 'cohere/rerank-4-fast';
export const RERANKING_STRATEGY = 'structured-yaml-v1';

/** Titles are retrieval evidence, not display-only metadata. */
export const rerankDocumentText = (match: SearchMatch): string => {
	const content = match.document.content
		.split('\n')
		.map((line) => `  ${line}`)
		.join('\n');
	return [
		match.document.sourceTitle ? `Title: ${JSON.stringify(match.document.sourceTitle)}` : undefined,
		match.document.sectionPath
			? `Section: ${JSON.stringify(match.document.sectionPath)}`
			: undefined,
		`Content: |-\n${content}`
	]
		.filter((part): part is string => part !== undefined)
		.join('\n');
};
