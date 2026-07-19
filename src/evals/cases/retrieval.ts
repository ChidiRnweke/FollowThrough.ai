import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
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
const queries = [
	{
		id: 'retrieval-postgres-failover',
		query: 'the database primary is down, how do I promote the standby?',
		phrase: 'pg_ctl promote'
	},
	{
		id: 'retrieval-cache-pressure',
		query: 'our cache hit rate collapsed and memory is full',
		phrase: 'allkeys-lru'
	},
	{
		id: 'retrieval-tls-expiry',
		query: 'clients are getting handshake errors after sixty days',
		phrase: 'ACME challenge'
	}
];

export const retrievalCases: readonly EvalCase[] = queries.map((entry) => ({
	id: entry.id,
	name: `ranks the right runbook first for: ${entry.query}`,
	splits: [ARCHETYPES.retrieval],
	input: { query: entry.query },
	expected: { phrase: entry.phrase },
	async run(lab) {
		const workspace = await seedWorkspace(lab, retrievalCorpusWorkspace);
		const matches = await lab.controllers
			.retrieval()
			.search(workspace.actor, { query: entry.query });

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

		expect(matches.length, 'search returned nothing at all').toBeGreaterThan(0);
		expect(top, `expected the top result to mention "${entry.phrase}"`).toContain(entry.phrase);
	}
}));
