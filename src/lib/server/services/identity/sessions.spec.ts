import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InMemorySessionRepository } from '$lib/testing/identity/fakes/in-memory-sessions';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { sessionIdSchema, sessionTokenSchema } from '$lib/models/identity';
import { SessionRegistry } from './sessions';

const day = 24 * 60 * 60 * 1000;
const startedAt = Date.parse('2026-09-16T12:00:00Z');
/** The default absolute lifetime: three 30-day periods. */
const lifetime = { maxLifetimeMs: 90 * day };
const setup = async () => {
	const users = new InMemoryUserRepository(testActor());
	await users.ensureLocal();
	const repository = new InMemorySessionRepository();
	repository.users = users.users;
	const clock = { now: startedAt };
	const registry = new SessionRegistry(repository, lifetime, () => clock.now);
	const { token, session } = await registry.createSession(testActor().userId);
	return { repository, registry, clock, token, session };
};
/** Uses the session at each offset (ms after sign-in), in order, and answers each deadline. */
const useAt = async (offsets: readonly number[]) => {
	const { registry, clock, token } = await setup();
	const outcomes: (string | null)[] = [];
	for (const offset of offsets) {
		clock.now = startedAt + offset;
		const validated = await registry.validateSession(token);
		outcomes.push(validated ? validated.session.expiresAt.toISOString() : null);
	}
	return outcomes;
};
const afterSignIn = (days: number) => new Date(startedAt + days * day).toISOString();

describe('authenticated session lifetime', () => {
	it('persists a session valid for thirty days', async () => {
		const { repository, session } = await setup();
		expect(repository.sessions.get(session.id)).toEqual({
			...session,
			userId: testActor().userId,
			expiresAt: new Date(startedAt + 30 * day)
		});
	});
	it('issues independent 256-bit tokens for new sessions', async () => {
		const { registry, token } = await setup();
		const second = await registry.createSession(testActor().userId);
		expect({
			first: /^[a-f0-9]{64}$/.test(token),
			second: /^[a-f0-9]{64}$/.test(second.token),
			distinct: token !== second.token
		}).toEqual({ first: true, second: true, distinct: true });
	});
	it('stores the sha256 digest of the cookie token, never the token itself', async () => {
		const { repository, token } = await setup();
		expect([...repository.sessions.keys()]).toEqual([
			createHash('sha256').update(token).digest('hex')
		]);
	});
	it('does not open a session with its stored id', async () => {
		const { registry, session } = await setup();
		expect(await registry.validateSession(sessionTokenSchema.parse(session.id))).toBeNull();
	});
	it('resumes a session by its cookie token', async () => {
		const { registry, token, session } = await setup();
		expect((await registry.validateSession(token))?.session).toEqual(session);
	});
	it('returns no identity for a missing session', async () => {
		const { registry } = await setup();
		expect(await registry.validateSession(sessionTokenSchema.parse('0'.repeat(64)))).toBeNull();
	});
	it('keeps an unexpired session unchanged before the renewal boundary', async () => {
		const { registry, repository, clock, token, session } = await setup();
		clock.now += 15 * day - 1;
		repository.failure = 'write';
		expect((await registry.validateSession(token))?.session).toEqual(session);
	});
	it('renews for thirty days at the exact fifteen-day boundary and records the renewal', async () => {
		const { registry, repository, clock, token, session } = await setup();
		clock.now += 15 * day;
		const validated = await registry.validateSession(token);
		const renewed = {
			expiresAt: new Date(startedAt + 45 * day),
			lastRenewedAt: afterSignIn(15)
		};
		expect({
			returned: validated?.session,
			stored: repository.sessions.get(session.id)
		}).toEqual({ returned: { ...session, ...renewed }, stored: { ...session, ...renewed } });
	});
	it('deletes a session at its exact expiry', async () => {
		const { registry, repository, clock, token, session } = await setup();
		clock.now += 30 * day;
		expect({
			identity: await registry.validateSession(token),
			stored: repository.sessions.has(session.id)
		}).toEqual({ identity: null, stored: false });
	});
	it('renews no further than ninety days after sign-in', async () => {
		expect(await useAt([15 * day, 30 * day, 45 * day, 60 * day, 75 * day])).toEqual([
			afterSignIn(45),
			afterSignIn(60),
			afterSignIn(75),
			afterSignIn(90),
			afterSignIn(90)
		]);
	});
	it('admits a session until the exact end of its absolute lifetime', async () => {
		expect(await useAt([15 * day, 30 * day, 45 * day, 60 * day, 90 * day - 1, 90 * day])).toEqual([
			afterSignIn(45),
			afterSignIn(60),
			afterSignIn(75),
			afterSignIn(90),
			afterSignIn(90),
			null
		]);
	});
	it('refuses and deletes a session whose deadline outlasts its absolute lifetime', async () => {
		const { registry, repository, clock, token, session } = await setup();
		repository.sessions.set(session.id, { ...session, expiresAt: new Date(startedAt + 120 * day) });
		clock.now += 90 * day;
		expect({
			identity: await registry.validateSession(token),
			stored: repository.sessions.has(session.id)
		}).toEqual({ identity: null, stored: false });
	});
	it('revokes a session on logout', async () => {
		const { registry, token } = await setup();
		await registry.logout(token);
		expect(await registry.validateSession(token)).toBeNull();
	});
	it('does not authenticate when session reading fails', async () => {
		const { registry, repository, token } = await setup();
		repository.failure = 'read';
		await expect(registry.validateSession(token)).rejects.toThrow('Session storage unavailable');
	});
	it('does not return a renewed session when saving its expiry fails', async () => {
		const { registry, repository, clock, token } = await setup();
		clock.now += 15 * day;
		repository.failure = 'write';
		await expect(registry.validateSession(token)).rejects.toThrow('Session storage unavailable');
	});
	it('does not report logout success when deletion fails', async () => {
		const { registry, repository, token } = await setup();
		repository.failure = 'delete';
		await expect(registry.logout(token)).rejects.toThrow('Session storage unavailable');
	});
	it('does not return a new session when storage rejects it', async () => {
		const { registry, repository } = await setup();
		repository.failure = 'write';
		await expect(registry.createSession(testActor().userId)).rejects.toThrow(
			'Session storage unavailable'
		);
	});
});

describe('session token and id shapes', () => {
	it('admits every token and id a new session receives', async () => {
		const { registry } = await setup();
		const issued = await Promise.all(
			Array.from({ length: 20 }, () => registry.createSession(testActor().userId))
		);
		expect(
			issued.filter(
				({ token, session }) =>
					!sessionTokenSchema.safeParse(token).success ||
					!sessionIdSchema.safeParse(session.id).success
			)
		).toEqual([]);
	});
	it.each([
		['an empty value', ''],
		['one hex digit short', 'a'.repeat(63)],
		['one hex digit long', 'a'.repeat(65)],
		['upper-case hex', 'A'.repeat(64)],
		['a non-hex character', `${'a'.repeat(63)}g`],
		['surrounding whitespace', ` ${'a'.repeat(64)}`],
		['an oversized value', 'a'.repeat(64 * 1024)]
	])('refuses %s', (_case, value) => {
		expect(sessionTokenSchema.safeParse(value).success).toBe(false);
	});
});
