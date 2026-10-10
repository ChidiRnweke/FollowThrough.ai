import { AgentRunSettingsService } from '$lib/services/agent/run-settings';
import { References } from './controller';
import { referenceSearchFixture } from '$lib/testing/references/fixtures/search';
import type { WebReferenceClient } from '$lib/server/controllers/references/controller';
import type { WebResearchOptions } from '$lib/models/agent';
import { describe, expect, it } from 'vitest';
import type { TextSelection } from '$lib/models/notes';
import type { Url } from '$lib/models/references';
import { ReferenceDiscovery } from '$lib/server/services/references/discovery';
import { ReferenceResearch } from '$lib/server/adapters/references/web-research';
import { InMemoryWebReferenceClient } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const selection: TextSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 9,
	text: 'Use OAuth'
};

const result = {
	url: 'https://www.rfc-editor.org/rfc/rfc6749' as Url,
	title: 'RFC 6749',
	hostname: 'www.rfc-editor.org',
	content: 'Defines the selected authorization protocol.'
};

const searchOwner = (
	client: WebReferenceClient,
	candidates: ReferenceDiscovery,
	settings: AgentRunSettingsService,
	overrides: WebResearchOptions
) => {
	const fixture = referenceSearchFixture();
	return new References({
		...fixture.dependencies,
		referenceClient: client,
		referenceCandidates: candidates,
		researchSettings: settings,
		researchOverrides: overrides
	});
};
describe('Reference discovery', () => {
	it('returns structured web references', async () => {
		const client = new InMemoryWebReferenceClient();
		client.result = [result];
		const finder = searchOwner(client, new ReferenceDiscovery(), new AgentRunSettingsService(), {});
		const references = await finder.suggestFromSelection(testActor(), { selection });
		expect(
			references.outcome === 'found' ? references.suggestions[0]?.payload : undefined
		).toMatchObject({
			url: result.url,
			tier: 'standard',
			relevanceNote: result.content
		});
	});

	it('accepts an honest empty web result', async () => {
		const client = new InMemoryWebReferenceClient();
		client.result = [];
		const finder = searchOwner(client, new ReferenceDiscovery(), new AgentRunSettingsService(), {});
		const references = await finder.suggestFromSelection(testActor(), { selection });
		expect(references.outcome).toBe('nothing_relevant');
	});

	it('passes the selected conversation model to the web client', async () => {
		const client = new InMemoryWebReferenceClient();
		client.result = [];
		const finder = searchOwner(client, new ReferenceDiscovery(), new AgentRunSettingsService(), {});
		await finder.suggestFromSelection(
			testActor(),
			{ selection },
			{ model: 'google/gemini-3-flash' }
		);
		expect(client.model).toBe('google/gemini-3-flash');
	});

	it('rejects a missing structured web result', async () => {
		const client = new InMemoryWebReferenceClient();
		const finder = searchOwner(client, new ReferenceDiscovery(), new AgentRunSettingsService(), {});
		await expect(finder.suggestFromSelection(testActor(), { selection })).rejects.toMatchObject({
			code: 'INVALID_GENERATED_CONTENT'
		});
	});

	it('maps web client failures to an external-service error', async () => {
		const client = new InMemoryWebReferenceClient();
		client.failure = new Error('search unavailable');
		const finder = searchOwner(client, new ReferenceDiscovery(), new AgentRunSettingsService(), {});
		await expect(finder.suggestFromSelection(testActor(), { selection })).rejects.toMatchObject({
			code: 'EXTERNAL_SERVICE'
		});
	});

	it('reports missing configuration instead of claiming there are no relevant sources', async () => {
		const finder = searchOwner(
			new ReferenceResearch('', {
				baseURL: 'http://127.0.0.1:9',
				appURL: 'https://followthrough.test',
				defaultModel: 'test/model',
				observer: { run: (_name, _context, body) => body() }
			}),
			new ReferenceDiscovery(),
			new AgentRunSettingsService(),
			{}
		);
		await expect(finder.suggestFromSelection(testActor(), { selection })).rejects.toMatchObject({
			code: 'EXTERNAL_SERVICE'
		});
	});
});

it('resolves partial deployment overrides against the reference budget at search time', async () => {
	const client = new InMemoryWebReferenceClient();
	client.result = [];
	const finder = searchOwner(client, new ReferenceDiscovery(), new AgentRunSettingsService(), {
		engine: 'firecrawl',
		maxResults: 5
	});
	await finder.suggestFromSelection(testActor(), { selection });
	expect(client.research).toEqual({ engine: 'firecrawl', maxResults: 5, maxTotalResults: 16 });
});

it('preserves cancellation errors instead of reporting a provider failure', async () => {
	const client = new InMemoryWebReferenceClient();
	const cancellation = new Error('Search cancelled');
	const abort = new AbortController();
	abort.abort(cancellation);
	client.failure = cancellation;
	const finder = searchOwner(client, new ReferenceDiscovery(), new AgentRunSettingsService(), {});
	await expect(
		finder.suggestFromSelection(testActor(), { selection }, { signal: abort.signal })
	).rejects.toBe(cancellation);
});
