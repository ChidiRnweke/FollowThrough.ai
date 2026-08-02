import { describe, expect, it } from 'vitest';
import type { Database } from '$lib/server/db';
import { createAgentCapability } from './agent-capability-factory';

const db = {} as Database;

describe('createAgentCapability wiring', () => {
	it('resolves controllers lazily without invoking the provider at construction', () => {
		let resolved = 0;
		const capability = createAgentCapability({
			db,
			transactionRunner: {} as never,
			controllers: () => {
				resolved += 1;
				return {} as never;
			},
			toolRetriever: {} as never,
			notes: {} as never,
			skills: {} as never,
			projects: {} as never,
			memory: {} as never,
			provenance: {} as never,
			openRouterApiKey: 'test',
			openRouterBaseURL: 'http://127.0.0.1:9',
			appURL: 'http://localhost:5173',
			defaultModel: 'openai/test',
			defaultVisionModel: 'google/test',
			recommendedModels: [],
			modelCatalog: {
				list: async () => []
			} as never
		});
		expect({
			resolved,
			lifecycle: capability.executor !== undefined,
			conversations: capability.conversations !== undefined,
			preferences: capability.preferences !== undefined
		}).toEqual({ resolved: 0, lifecycle: true, conversations: true, preferences: true });
	});
});
