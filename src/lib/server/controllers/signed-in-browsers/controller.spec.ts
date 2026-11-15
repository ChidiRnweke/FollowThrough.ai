import { describe, expect, it } from 'vitest';
import { NotFoundError } from '$lib/errors';
import { SessionRegistry, SignedInBrowserDirectory } from '$lib/server/services/identity/sessions';
import { InMemorySessionRepository } from '$lib/testing/identity/fakes/in-memory-sessions';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { SignedInBrowsers } from './controller';

const day = 24 * 60 * 60 * 1000;
const startedAt = Date.parse('2026-09-16T12:00:00Z');
const lifetime = { maxLifetimeMs: 90 * day };

const setup = async () => {
	const repository = new InMemorySessionRepository();
	for (const actor of [testActor(), testActor(2)]) {
		const users = new InMemoryUserRepository(actor);
		await users.ensureLocal();
		repository.users.push(...users.users);
	}
	const clock = { now: startedAt };
	const registry = new SessionRegistry(repository, lifetime, () => clock.now);
	const signIn = async (actor = testActor()) => {
		const issued = await registry.createSession(actor.userId);
		clock.now += day;
		return issued;
	};
	const here = await signIn();
	const laptop = await signIn();
	const phone = await signIn();
	const otherUser = await signIn(testActor(2));
	const controller = new SignedInBrowsers({
		browsers: new SignedInBrowserDirectory(
			repository.forUser(testActor()),
			lifetime,
			() => clock.now
		)
	});
	const admits = async (token: (typeof here)['token']) =>
		(await registry.validateSession(token)) !== null;
	return { repository, registry, clock, controller, here, laptop, phone, otherUser, admits };
};

describe('signed-in browsers controller', () => {
	it("lists the user's sessions newest first and marks the asking browser", async () => {
		const { controller, here, laptop, phone } = await setup();
		expect(await controller.list(here.token)).toEqual(
			[phone, laptop, here].map(({ session }) => ({
				id: session.id,
				createdAt: session.createdAt,
				lastRenewedAt: undefined,
				expiresAt: session.expiresAt,
				current: session.id === here.session.id
			}))
		);
	});

	it('sends no session token to the browser', async () => {
		const { controller, here, laptop, phone } = await setup();
		const listed = JSON.stringify(await controller.list(here.token));
		expect([here, laptop, phone].filter(({ token }) => listed.includes(token))).toEqual([]);
	});

	it('omits a session that no longer admits a browser', async () => {
		const { controller, repository, here, laptop } = await setup();
		repository.sessions.set(laptop.session.id, {
			...laptop.session,
			expiresAt: new Date(startedAt)
		});
		expect((await controller.list(here.token)).map(({ id }) => id)).not.toContain(
			laptop.session.id
		);
	});

	it('shows the absolute lifetime as the end of a session renewed up to it', async () => {
		const { controller, repository, here } = await setup();
		repository.sessions.set(here.session.id, {
			...here.session,
			expiresAt: new Date(startedAt + 120 * day)
		});
		const listed = await controller.list(here.token);
		expect(listed.find(({ current }) => current)?.expiresAt).toEqual(
			new Date(startedAt + 90 * day)
		);
	});

	it('signs out one browser and keeps the others signed in', async () => {
		const { controller, here, laptop, phone, admits } = await setup();
		await controller.signOut(laptop.session.id);
		expect({
			here: await admits(here.token),
			laptop: await admits(laptop.token),
			phone: await admits(phone.token)
		}).toEqual({ here: true, laptop: false, phone: true });
	});

	it("refuses to sign out another user's browser", async () => {
		const { controller, otherUser, admits } = await setup();
		const refused = await controller.signOut(otherUser.session.id).then(
			() => 'signed out',
			(error: Error) => error instanceof NotFoundError
		);
		expect({ refused, stillSignedIn: await admits(otherUser.token) }).toEqual({
			refused: true,
			stillSignedIn: true
		});
	});

	it("signs out every other browser of the user and keeps the asking one and other users'", async () => {
		const { controller, here, laptop, phone, otherUser, admits } = await setup();
		expect({
			signedOut: await controller.signOutOthers(here.token),
			here: await admits(here.token),
			laptop: await admits(laptop.token),
			phone: await admits(phone.token),
			otherUser: await admits(otherUser.token)
		}).toEqual({ signedOut: 2, here: true, laptop: false, phone: false, otherUser: true });
	});
});
