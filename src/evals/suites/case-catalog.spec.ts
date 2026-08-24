import { describe, expect, it } from 'vitest';
import { TOOL_CATALOG } from '$lib/models/agent/tool-catalog';
import { TOOL_RETRIEVAL_GOALS } from '../cases/tool-retrieval';
import { ALL_EVAL_CASES, SMOKE_CASE_IDS, selectEvalCases } from './case-catalog';

describe('eval case selection', () => {
	it('keeps the ambiguity-hardened inventory at 211 cases', () => {
		expect(ALL_EVAL_CASES).toHaveLength(211);
	});

	it('keeps every stable case id unique', () => {
		expect(new Set(ALL_EVAL_CASES.map((evalCase) => evalCase.id)).size).toBe(ALL_EVAL_CASES.length);
	});

	it('covers every long-tail tool with a retrieval goal', () => {
		const covered = new Set(TOOL_RETRIEVAL_GOALS.map((goal) => goal.expected));
		expect(TOOL_CATALOG.filter((tool) => !covered.has(tool.name)).map((tool) => tool.name)).toEqual(
			[]
		);
	});

	it('selects every case in an exact section', () => {
		expect(selectEvalCases({ section: 'retrieval' }).map((evalCase) => evalCase.id)).toEqual([
			'retrieval-postgres-failover',
			'retrieval-cache-pressure',
			'retrieval-tls-expiry',
			'retrieval-hard-failover-with-pool-distractor',
			'retrieval-hard-cache-pressure-with-leak-distractor',
			'retrieval-hard-certificate-with-secret-distractor',
			'retrieval-hard-failover-negative-evidence'
		]);
	});

	it('selects one exact stable case id', () => {
		expect(
			selectEvalCases({ caseId: 'retrieval-cache-pressure' }).map((evalCase) => evalCase.id)
		).toEqual(['retrieval-cache-pressure']);
	});

	it('rejects an unknown section', () => {
		expect(() => selectEvalCases({ section: 'retrievel' })).toThrow('Unknown EVAL_SECTION');
	});

	it('rejects an unknown case id', () => {
		expect(() => selectEvalCases({ caseId: 'retrieval-missing' })).toThrow('Unknown EVAL_CASE');
	});

	it('rejects selectors whose intersection contains no cases', () => {
		expect(() =>
			selectEvalCases({ section: 'retrieval', caseId: 'effect-todo-persisted' })
		).toThrow('matched zero cases');
	});

	it('keeps the explicit smoke case set unchanged', () => {
		expect(selectEvalCases({ profile: 'smoke' }).map((evalCase) => evalCase.id)).toEqual(
			ALL_EVAL_CASES.filter((evalCase) => SMOKE_CASE_IDS.has(evalCase.id)).map(
				(evalCase) => evalCase.id
			)
		);
	});
});
