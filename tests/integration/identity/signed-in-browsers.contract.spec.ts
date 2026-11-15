import { expect, it } from 'vitest';
import type { UserId } from '$lib/models/identity';
import {
	SessionRecords,
	UserSessionRecords
} from '$lib/server/repositories/identity/postgres/sessions';
import { UserAccountRecords } from '$lib/server/repositories/identity/postgres/users';
import { SessionRegistry, SignedInBrowserDirectory } from '$lib/server/services/identity/sessions';
import { context } from '../database-harness';

const lifetime = { maxLifetimeMs: 90 * 24 * 60 * 60 * 1000 };

const setup = async () => {
	const accounts = new UserAccountRecords(context.db);
	const account = () =>
		accounts.create({
			email: `browsers-${crypto.randomUUID()}@example.test`,
			displayName: 'Signed-in browsers contract',
			role: 'USER'
		});
	const [user, otherUser] = [await account(), await account()];
	const registry = new SessionRegistry(new SessionRecords(context.db), lifetime);
	const signIn = (userId: UserId) => registry.createSession(userId);
	const browsers = new SignedInBrowserDirectory(
		new UserSessionRecords({ userId: user.id }, context.db),
		lifetime
	);
	const admits = async ({ token }: Awaited<ReturnType<typeof signIn>>) =>
		(await registry.validateSession(token)) !== null;
	return { user, otherUser, signIn, browsers, admits };
};

it("lists only the user's own sessions and marks the asking browser", async () => {
	const { user, otherUser, signIn, browsers } = await setup();
	const here = await signIn(user.id);
	const laptop = await signIn(user.id);
	await signIn(otherUser.id);
	const listed = await browsers.list(here.token);
	expect(listed.map(({ id, current }) => ({ id, current }))).toEqual([
		{ id: laptop.session.id, current: false },
		{ id: here.session.id, current: true }
	]);
});

it("signs out the user's other browsers and no one else's", async () => {
	const { user, otherUser, signIn, browsers, admits } = await setup();
	const here = await signIn(user.id);
	const laptop = await signIn(user.id);
	const elsewhere = await signIn(otherUser.id);
	const signedOut = await browsers.signOutOthers(here.token);
	expect({
		signedOut,
		here: await admits(here),
		laptop: await admits(laptop),
		elsewhere: await admits(elsewhere)
	}).toEqual({ signedOut: 1, here: true, laptop: false, elsewhere: true });
});

it("does not sign out another user's browser by its id", async () => {
	const { otherUser, signIn, browsers, admits } = await setup();
	const elsewhere = await signIn(otherUser.id);
	const refused = await browsers.signOut(elsewhere.session.id).then(
		() => false,
		() => true
	);
	expect({ refused, elsewhere: await admits(elsewhere) }).toEqual({
		refused: true,
		elsewhere: true
	});
});
