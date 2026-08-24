import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { retrievalCorpusWorkspace } from '../fixtures/workspaces/engineering';
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
		prompt:
			'Clients are getting handshake errors after sixty days. Which exact path does our runbook say to check?',
		phrase: 'ACME challenge'
	},
	{
		id: 'retrieval-hard-failover-with-pool-distractor',
		prompt:
			'The old writer endpoint cannot be reached, but the waiting copy is healthy. Which exact command from our runbooks should I use to restore service without waiting for the old node?',
		phrase: 'pg_ctl promote'
	},
	{
		id: 'retrieval-hard-cache-pressure-with-leak-distractor',
		prompt:
			'Nothing is down, but repeated reads keep missing while resident bytes sit at the ceiling. I must not purge live data. Which exact cache policy does our runbook say applies?',
		phrase: 'allkeys-lru'
	},
	{
		id: 'retrieval-hard-certificate-with-secret-distractor',
		prompt:
			'A browser refuses the site identity, and unattended renewal last succeeded about two months ago. Which exact path does our runbook say to check?',
		phrase: 'ACME challenge'
	},
	{
		id: 'retrieval-hard-failover-negative-evidence',
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
		const result = await runCase(lab, workspace.actor, {
			prompt: entry.prompt,
			mode: 'auto_accept'
		});
		const usedRetrieval = result.calledToolNames.some((name) =>
			['search', 'get_note', 'grep', 'sed'].includes(name)
		);
		const grounded = result.finalResponse.toLowerCase().includes(entry.phrase.toLowerCase());

		px.logOutput({
			model: result.model,
			toolCalls: result.calledToolNames,
			response: result.finalResponse.slice(0, 500)
		});
		px.logAnnotation({
			name: ARCHETYPES.retrieval,
			score: usedRetrieval && grounded ? 1 : 0,
			label: usedRetrieval && grounded ? 'resolved' : 'miss',
			explanation: usedRetrieval
				? grounded
					? `read workspace evidence and grounded the answer in "${entry.phrase}"`
					: `read workspace evidence but did not return "${entry.phrase}"`
				: 'answered without reading the competing runbooks'
		});

		expect({ status: result.status, usedRetrieval, grounded }).toEqual({
			status: 'completed',
			usedRetrieval: true,
			grounded: true
		});
	}
}));

export const retrievalCases: readonly EvalCase[] = [
	...directRetrievalCases,
	...ambiguousAgentRetrievalCases
];
