import { describe, expect, it } from 'vitest';
import { InMemorySessionRepository } from '$lib/testing/identity/fakes/in-memory-sessions';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { SessionRegistry } from './sessions';

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
	return { repository, registry, clock, session };
};
describe('authenticated session lifetime', () => {
	it('persists a session valid for thirty days', async () => {
		const { repository, session } = await setup();
		expect(repository.sessions.get(session.id)).toEqual({
			...session,
			userId: testActor().userId,
			expiresAt: new Date(startedAt + 30 * day)
		});
	});
	it('uses independent 256-bit identifiers for new sessions', async () => {
		const { registry, session } = await setup();
		const second = await registry.createSession(testActor().userId);
		expect({
			first: /^[a-f0-9]{64}$/.test(session.id),
			second: /^[a-f0-9]{64}$/.test(second.id),
			distinct: session.id !== second.id
		}).toEqual({ first: true, second: true, distinct: true });
	});
	it('returns no identity for a missing session', async () => {
		const { registry } = await setup();
		expect(await registry.validateSession('missing')).toBeNull();
	});
	it('keeps an unexpired session unchanged before the renewal boundary', async () => {
		const { registry, repository, clock, session } = await setup();
		clock.now += 15 * day - 1;
		repository.failure = 'write';
		expect((await registry.validateSession(session.id))?.session).toEqual(session);
	});
	it('renews for thirty days at the exact fifteen-day boundary', async () => {
		const { registry, repository, clock, session } = await setup();
		clock.now += 15 * day;
		const validated = await registry.validateSession(session.id);
		expect({
			returned: validated?.session.expiresAt,
			stored: repository.sessions.get(session.id)?.expiresAt
		}).toEqual({
			returned: new Date(startedAt + 45 * day),
			stored: new Date(startedAt + 45 * day)
		});
	});
	it('deletes a session at its exact expiry', async () => {
		const { registry, repository, clock, session } = await setup();
		clock.now += 30 * day;
		expect({
			identity: await registry.validateSession(session.id),
			stored: repository.sessions.has(session.id)
		}).toEqual({ identity: null, stored: false });
	});
	it('revokes a session on logout', async () => {
		const { registry, session } = await setup();
		await registry.logout(session.id);
		expect(await registry.validateSession(session.id)).toBeNull();
	});
	it('does not authenticate when session reading fails', async () => {
		const { registry, repository, session } = await setup();
		repository.failure = 'read';
		await expect(registry.validateSession(session.id)).rejects.toThrow(
			'Session storage unavailable'
		);
	});
	it('does not return a renewed session when saving its expiry fails', async () => {
		const { registry, repository, clock, session } = await setup();
		clock.now += 15 * day;
		repository.failure = 'write';
		await expect(registry.validateSession(session.id)).rejects.toThrow(
			'Session storage unavailable'
		);
	});
	it('does not report logout success when deletion fails', async () => {
		const { registry, repository, session } = await setup();
		repository.failure = 'delete';
		await expect(registry.logout(session.id)).rejects.toThrow('Session storage unavailable');
	});
	it('does not return a new session when storage rejects it', async () => {
		const { registry, repository } = await setup();
		repository.failure = 'write';
		await expect(registry.createSession(testActor().userId)).rejects.toThrow(
			'Session storage unavailable'
		);
	});
});
