import { afterEach, expect, it, vi } from 'vitest';
import { CHAT_WEB_SEARCH_DEFAULTS } from '$lib/models/agent';
import { isTerminalAgentRunStatus } from '$lib/services/agent/run-status';
import { agentSubmissionFixture } from '$lib/testing/agent/fixtures/submission';
import { testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

const active: ReturnType<typeof agentSubmissionFixture>[] = [];
const setup = (configuration: Parameters<typeof agentSubmissionFixture>[1] = {}) => {
	const fixture = agentSubmissionFixture('queued', configuration);
	active.push(fixture);
	return fixture;
};
afterEach(async () => {
	for (const fixture of active.splice(0)) {
		for (const run of fixture.runs.runs) await fixture.controller.cancel(testActor(), run.id);
		fixture.release();
		await vi.waitFor(() => {
			if (fixture.runs.runs.some((run) => !isTerminalAgentRunStatus(run.status)))
				throw new Error('Run did not settle');
		});
	}
});

it('freezes the deployment research defaults with a new run', async () => {
	const fixture = setup();
	await fixture.controller.submit(testActor(), {
		requestId: crypto.randomUUID(),
		input: 'Research this'
	});
	const run = fixture.runs.runs[0];
	if (run?.kind !== 'agent') throw new Error('Expected a saved chat run');
	expect(run.inputSnapshot.webSearch).toEqual(CHAT_WEB_SEARCH_DEFAULTS);
});

it('freezes selected account settings together with deployment defaults', async () => {
	const fixture = setup({
		webSearchDefaults: { engine: 'firecrawl', maxResults: 17, maxTotalResults: 34 }
	});
	fixture.preferenceRecords.entries.set(testActor().userId, {
		...fixture.preferences.defaults(testActor(), testNow),
		webSearchMaxResults: 5
	});
	await fixture.controller.submit(testActor(), {
		requestId: crypto.randomUUID(),
		input: 'Research this'
	});
	const run = fixture.runs.runs[0];
	if (run?.kind !== 'agent') throw new Error('Expected a saved chat run');
	expect(run.inputSnapshot.webSearch).toEqual({
		engine: 'firecrawl',
		maxResults: 5,
		maxTotalResults: 34
	});
});

it('executes the frozen budget after injected deployment defaults change', async () => {
	const defaults = { ...CHAT_WEB_SEARCH_DEFAULTS, maxResults: 7 };
	const fixture = setup({ webSearchDefaults: defaults });
	await fixture.controller.submit(testActor(), {
		requestId: crypto.randomUUID(),
		input: 'Research this'
	});
	defaults.maxResults = 25;
	fixture.release();
	await fixture.runner.started.promise;
	expect(fixture.runner.researchSettings[0]).toEqual({
		...CHAT_WEB_SEARCH_DEFAULTS,
		maxResults: 7
	});
});

it('retains frozen research settings on retry after account preferences change', async () => {
	const fixture = setup();
	const receipt = await fixture.controller.submit(testActor(), {
		requestId: crypto.randomUUID(),
		input: 'Research this'
	});
	await fixture.controller.cancel(testActor(), receipt.runId);
	fixture.preferenceRecords.entries.set(testActor().userId, {
		...fixture.preferences.defaults(testActor(), testNow),
		webSearchEngine: 'perplexity',
		webSearchMaxResults: 5
	});
	const retry = await fixture.controller.retry(testActor(), receipt.runId, crypto.randomUUID());
	const run = fixture.runs.runs.find((run) => run.id === retry.runId);
	if (run?.kind !== 'agent') throw new Error('Expected a saved retry');
	expect(run.inputSnapshot.webSearch).toEqual(CHAT_WEB_SEARCH_DEFAULTS);
});

it('resolves missing fields of a legacy saved request before provider execution', async () => {
	const fixture = setup({
		webSearchDefaults: { engine: 'firecrawl', maxResults: 17, maxTotalResults: 34 }
	});
	const receipt = await fixture.controller.submit(testActor(), {
		requestId: crypto.randomUUID(),
		input: 'Research this'
	});
	fixture.runs.runs = fixture.runs.runs.map((run) =>
		run.id === receipt.runId && run.kind === 'agent'
			? { ...run, inputSnapshot: { ...run.inputSnapshot, webSearch: { maxResults: 5 } } }
			: run
	);
	fixture.release();
	await fixture.runner.started.promise;
	expect(fixture.runner.researchSettings[0]).toEqual({
		engine: 'firecrawl',
		maxResults: 5,
		maxTotalResults: 34
	});
});
