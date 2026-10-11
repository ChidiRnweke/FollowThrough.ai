import { afterEach, expect, it } from 'vitest';
import { requestActor } from './config';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const originalClientId = process.env.AUTHENTIK_CLIENT_ID;
afterEach(() => {
	if (originalClientId === undefined) delete process.env.AUTHENTIK_CLIENT_ID;
	else process.env.AUTHENTIK_CLIENT_ID = originalClientId;
});

it.each([undefined, '', ' ', 'configured-provider'])(
	'refuses an absent authenticated actor with client ID %s',
	(clientId) => {
		if (clientId === undefined) delete process.env.AUTHENTIK_CLIENT_ID;
		else process.env.AUTHENTIK_CLIENT_ID = clientId;
		expect(() => requestActor()).toThrow('Authenticated user is required');
	}
);

it('uses the validated account even when provider configuration is absent', () => {
	delete process.env.AUTHENTIK_CLIENT_ID;
	expect(requestActor({ id: testActor().userId })).toEqual(testActor());
});
