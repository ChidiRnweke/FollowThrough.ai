import { expect, it } from 'vitest';
import { setSessionCookie } from './config';
import { SessionRegistry } from './services/identity/sessions';
import { InMemorySessionRepository } from '$lib/testing/identity/fakes/in-memory-sessions';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const day = 24 * 60 * 60 * 1000;
const startedAt = Date.parse('2026-09-16T12:00:00Z');
const setup = async () => {
	const users = new InMemoryUserRepository();
	await users.ensureLocal(testActor());
	const repository = new InMemorySessionRepository();
	repository.users = users.users;
	const clock = { now: startedAt };
	const registry = new SessionRegistry(repository, () => clock.now);
	const session = await registry.createSession(testActor().userId);
	return { registry, session, clock };
};
const browserCookie = (session: { id: string; expiresAt: Date }, now: number) => {
	const stored = new Map<
		string,
		{
			value: string;
			expiresAt: number;
			httpOnly: boolean;
			secure: boolean;
			sameSite: string;
			path: string;
		}
	>();
	const set: Parameters<typeof setSessionCookie>[0]['set'] = (name, value, options) => {
		stored.set(name, {
			value,
			expiresAt: now + options.maxAge * 1000,
			httpOnly: options.httpOnly,
			secure: options.secure,
			sameSite: options.sameSite,
			path: options.path
		});
	};
	setSessionCookie({ set }, session.id, true, session.expiresAt, now);
	return stored.get('session');
};
it('keeps a reissued cookie at the stored deadline before session renewal', async () => {
	const { registry, session, clock } = await setup();
	clock.now += 14 * day;
	const validated = await registry.validateSession(session.id);
	if (!validated) throw new Error('Session did not validate');
	expect(browserCookie(validated.session, clock.now)).toEqual({
		value: session.id,
		expiresAt: startedAt + 30 * day,
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		path: '/'
	});
});
it('keeps the browser signed in beyond the original deadline after renewal', async () => {
	const { registry, session, clock } = await setup();
	clock.now += 15 * day;
	const renewed = await registry.validateSession(session.id);
	if (!renewed) throw new Error('Session did not renew');
	clock.now += day;
	expect(browserCookie(renewed.session, clock.now)?.expiresAt).toBe(startedAt + 45 * day);
});
it('expires a cookie immediately if its saved session deadline already passed', () => {
	expect(
		browserCookie({ id: 'expired', expiresAt: new Date(startedAt) }, startedAt + day)?.expiresAt
	).toBe(startedAt + day);
});
