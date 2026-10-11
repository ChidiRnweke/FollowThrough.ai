import { describe, expect, it } from 'vitest';
import { workspaceBootstrapKey } from '$lib/models/workspace-bootstrap';
import { LocalStorageBootstrap } from './bootstrap';
const accountId = 'a0000000-0000-4000-8000-000000000001';
const bootstrap = {
	accountId,
	numericDefaults: { webSearchMaxResults: 5, webSearchMaxTotalResults: 10, agentMaxTurns: 10 },
	agentDefaults: { chatModelId: 'provider/chat', visionModelId: 'provider/vision' },
	agentModels: [
		{
			id: 'provider/chat',
			name: 'provider/chat',
			provider: 'provider',
			supportsTools: true,
			supportsVision: false,
			recommended: false,
			capabilities: ['configured']
		}
	],
	agentAvailable: false
};

const readFrom = (stored: string, accountHint: string | null) => {
	const values = new Map([[workspaceBootstrapKey, stored]]);
	return new LocalStorageBootstrap(() => ({
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value),
		removeItem: (key) => void values.delete(key)
	})).read(accountHint);
};

describe('offline startup account binding', () => {
	it('restores deployment metadata for the account confirmed by the server hint', () => {
		expect(readFrom(JSON.stringify(bootstrap), accountId)).toEqual({
			kind: 'stored',
			value: bootstrap
		});
	});
	it('does not expose the previous account bootstrap after sign-out clears the hint', () => {
		expect(readFrom(JSON.stringify(bootstrap), null)).toEqual({ kind: 'absent' });
	});
	it('does not restore another account’s metadata after switching accounts', () => {
		expect(readFrom(JSON.stringify(bootstrap), 'a0000000-0000-4000-8000-000000000002')).toEqual({
			kind: 'absent'
		});
	});
	it('reports corrupt persisted metadata instead of inventing deployment settings', () => {
		expect(readFrom('{broken', accountId)).toMatchObject({ kind: 'corrupt' });
	});
});
