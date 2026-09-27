import { afterEach, beforeEach, expect, it } from 'vitest';
import { requestActor } from './config';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const originalClientId = process.env.AUTHENTIK_CLIENT_ID;
const originalLocalId = process.env.LOCAL_USER_ID;
const localId = '00000000-0000-4000-8000-000000000002';
beforeEach(() => {
	process.env.LOCAL_USER_ID = localId;
});
afterEach(() => {
	if (originalClientId === undefined) delete process.env.AUTHENTIK_CLIENT_ID;
	else process.env.AUTHENTIK_CLIENT_ID = originalClientId;
	if (originalLocalId === undefined) delete process.env.LOCAL_USER_ID;
	else process.env.LOCAL_USER_ID = originalLocalId;
});
it('refuses an absent authenticated actor instead of selecting the local administrator', () => {
	process.env.AUTHENTIK_CLIENT_ID = 'configured-provider';
	expect(() => requestActor()).toThrow('Authenticated user is required');
});
it('uses the validated account when authentication is enabled', () => {
	process.env.AUTHENTIK_CLIENT_ID = 'configured-provider';
	expect(requestActor({ id: testActor().userId })).toEqual(testActor());
});
it('uses the configured local account when authentication is disabled', () => {
	delete process.env.AUTHENTIK_CLIENT_ID;
	expect(requestActor()).toEqual({ userId: localId });
});
it('does not adopt a stale browser identity in single-user mode', () => {
	process.env.AUTHENTIK_CLIENT_ID = ' ';
	expect(requestActor({ id: testActor().userId })).toEqual({ userId: localId });
});
it('rejects an invalid configured local account instead of silently using the default', () => {
	delete process.env.AUTHENTIK_CLIENT_ID;
	process.env.LOCAL_USER_ID = 'invalid';
	expect(() => requestActor()).toThrow();
});
it('uses the fixed local account only when no local account is configured', () => {
	delete process.env.AUTHENTIK_CLIENT_ID;
	delete process.env.LOCAL_USER_ID;
	expect(requestActor()).toEqual({ userId: '00000000-0000-4000-8000-000000000001' });
});
