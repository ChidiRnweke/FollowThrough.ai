import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { retrievalCorpusWorkspace } from '../fixtures/workspaces/engineering';
import { hasSuccessfulReadEvidence } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Retrieval is a subsystem, not an agent behaviour, so these cases skip the
 * agent loop entirely: seed a corpus, query it, assert what ranks first. That
 * makes them roughly an order of magnitude cheaper than a full turn, and it
 * separates "the agent chose not to search" from "search ranked the wrong
 * document" — two failures indistinguishable from the outside.
 *
 * The corpus holds several operationally-similar runbooks on purpose, so a pass
 * means ranking worked rather than merely that something came back.
 */
const directQueries = [
	{
		id: 'retrieval-postgres-failover',
		query: 'the database primary is down, how do I promote the standby?',
		phrase: 'pg_ctl promote'
	},
	{
		id: 'retrieval-cache-pressure',
		query: 'our cache hit rate collapsed and memory is full',
		phrase: 'allkeys-lru'
	}
];

const ambiguousQueries = [
	{
		id: 'retrieval-tls-expiry',
		title: 'Certificate rotation runbook',
		prompt:
			'Clients are getting handshake errors after sixty days. Which exact path does our runbook say to check?',
		phrase: 'ACME challenge'
	},
	{
		id: 'retrieval-hard-cache-pressure-with-leak-distractor',
		title: 'Redis cache eviction runbook',
		prompt:
			'Nothing is down, but repeated reads keep missing while resident bytes sit at the ceiling. I must not purge live data. Which exact cache policy and no-purge instruction does our runbook give? Quote both.',
		phrase: [
			'allkeys-lru',
			'Never flush the cache during business hours; warm it from the read replica instead.'
		]
	},
	{
		id: 'retrieval-hard-certificate-with-secret-distractor',
		title: 'Certificate rotation runbook',
		prompt:
			'A browser refuses the site identity, and unattended renewal last succeeded about two months ago. Which exact path does our runbook say to check?',
		phrase: 'ACME challenge'
	},
	{
		id: 'retrieval-hard-failover-negative-evidence',
		title: 'Postgres failover runbook',
		prompt:
			'The writer is unreachable. The standby is caught up, and connection-pool metrics are normal. What exact recovery command does our runbook give?',
		phrase: 'pg_ctl promote'
	}
];

const directRetrievalCases: readonly EvalCase[] = directQueries.map((entry) => ({
	id: entry.id,
	name: `ranks the right runbook first for: ${entry.query}`,
	splits: [ARCHETYPES.retrieval],
	input: { query: entry.query },
	expected: { phrase: entry.phrase },
	async run(lab) {
		const workspace = await seedWorkspace(lab, retrievalCorpusWorkspace);
		const matches = await lab.controllers
			.retrieval()
			.search(workspace.actor, { query: entry.query, limit: 1 });

		const top = matches[0]?.content ?? '';
		px.logOutput({
			topResult: top.slice(0, 200),
			resultCount: matches.length,
			scores: matches.slice(0, 3).map((match) => match.score)
		});

		const hit = top.includes(entry.phrase);
		px.logAnnotation({
			name: ARCHETYPES.retrieval,
			score: hit ? 1 : 0,
			label: hit ? 'hit' : 'miss',
			explanation: hit
				? `top result contains "${entry.phrase}"`
				: `top result did not contain "${entry.phrase}"; got "${top.slice(0, 120)}"`
		});

		expect({ returnedResults: matches.length > 0, topHit: hit }).toEqual({
			returnedResults: true,
			topHit: true
		});
	}
}));

const ambiguousAgentRetrievalCases: readonly EvalCase[] = ambiguousQueries.map((entry) => ({
	id: entry.id,
	name: `retrieves competing runbooks and resolves: ${entry.prompt}`,
	splits: [ARCHETYPES.retrieval, ARCHETYPES.toolCalling],
	input: { prompt: entry.prompt },
	expected: { requiredTool: 'search', phrase: entry.phrase },
	metadata: {
		layer: 'agent',
		note: 'The correct runbook and a lexical distractor are both present; the final answer must resolve their conflicting conditions.'
	},
	async run(lab) {
		const workspace = await seedWorkspace(lab, retrievalCorpusWorkspace);
		const expectedNoteId = workspace.noteIds.get(entry.title);
		const projectId = workspace.projectIds.get('Runbooks');
		if (!expectedNoteId || !projectId) throw new Error(`Missing seeded runbook: ${entry.title}`);
		const expectedPath = `/projects/${projectId}/notes/${expectedNoteId}.md`;
		const result = await runCase(lab, workspace.actor, {
			prompt: entry.prompt,
			mode: 'auto_accept'
		});
		const phrases = (typeof entry.phrase === 'string' ? [entry.phrase] : entry.phrase).map(
			(phrase) => phrase.toLowerCase()
		);
		const groundedRead = hasSuccessfulReadEvidence(
			result.toolCalls,
			['search', 'grep', 'sed'],
			expectedNoteId,
			expectedPath,
			phrases
		);
		const grounded = phrases.every((phrase) => result.finalResponse.toLowerCase().includes(phrase));

		px.logOutput({
			model: result.model,
			toolCalls: result.calledToolNames,
			response: result.finalResponse.slice(0, 500)
		});
		px.logAnnotation({
			name: ARCHETYPES.retrieval,
			score: groundedRead && grounded ? 1 : 0,
			label: groundedRead && grounded ? 'resolved' : 'miss',
			explanation: groundedRead
				? grounded
					? `a successful read returned the requested evidence and the answer used it`
					: `read evidence but did not answer with all requested facts`
				: `no successful read returned all requested facts for ${entry.title}`
		});

		expect({ status: result.status, groundedRead, grounded }).toEqual({
			status: 'completed',
			groundedRead: true,
			grounded: true
		});
	}
}));

export const retrievalCases: readonly EvalCase[] = [
	...directRetrievalCases,
	...ambiguousAgentRetrievalCases
];
