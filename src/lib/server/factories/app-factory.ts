import { LocalIdentity, type LocalIdentityController } from '../controllers/identity/local';
import { instrumentedController } from './controller-instrumentation';
import { accessSurface, localIdentitySurface } from './controller-surfaces';
import { Access, type AccessController } from '../controllers/identity/access';
import type { McpSurfaceFactory } from './agent/mcp-tool-factory';
import { UserDirectory } from '$lib/server/services/identity/users';
import type { ActorContext } from '$lib/models/identity';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { createProductionComposition } from './production-factory';
import { SessionRegistry } from '$lib/server/services/identity/sessions';
import { AccessTokens } from '$lib/server/services/identity/api-tokens';
import { ApiTokenRecords } from '../repositories/identity/postgres/api-tokens';
import { SignIn, type ISignIn } from '$lib/server/controllers/identity/controller';
import { OAuthAuthorization } from '$lib/server/services/identity/oauth-authorization';
import { ProviderAccounts } from '$lib/server/services/identity/provider-accounts';
import { AuthentikClient } from '$lib/server/repositories/identity/authentik';
import { SessionRecords } from '../repositories/identity/postgres/sessions';
import { UserRecords } from '../repositories/identity/postgres/users';
import { db } from '../db';
import { authenticationEnabled, authentikConfiguration, requestActor } from '../config';

class DeferredValue<T> {
	private value: T | undefined;

	constructor(private readonly create: () => T) {}

	get(): T {
		return (this.value ??= this.create());
	}
}

const composition = new DeferredValue(createProductionComposition);
const localIdentity = new DeferredValue(() => {
	const users = new UserDirectory(new UserRecords(db));
	return instrumentedController(
		'localIdentity',
		new LocalIdentity({ provisioner: users, users }),
		localIdentitySurface
	);
});
const sessions = new DeferredValue(() => new SessionRegistry(new SessionRecords(db)));
const access = new DeferredValue(() => {
	const users = new UserDirectory(new UserRecords(db));
	return instrumentedController(
		'access',
		new Access({
			sessions: sessions.get(),
			tokens: new AccessTokens(new ApiTokenRecords(db)),
			provisioner: users,
			users,
			provenance: composition.get().system().provenance
		}),
		accessSurface
	);
});
const signIn = new DeferredValue(() => {
	const config = authentikConfiguration();
	return new SignIn({
		authorization: new OAuthAuthorization(new AuthentikClient(config), config),
		accounts: new ProviderAccounts(new UserRecords(db)),
		sessions: sessions.get()
	});
});

export class AppFactory {
	/** The controllers for one authenticated user's request. */
	static forActor(actor: ActorContext): ControllerFactory {
		return composition.get().forActor(actor).controllers;
	}

	/** The controllers for work that acts for no request: startup recovery. */
	static system(): ControllerFactory {
		return composition.get().system().controllers;
	}

	static mcpSurface(...args: Parameters<McpSurfaceFactory>): ReturnType<McpSurfaceFactory> {
		return composition
			.get()
			.system()
			.mcpSurface(...args);
	}

	static actor(locals?: App.Locals): ActorContext {
		return requestActor(locals?.user);
	}

	static localIdentity(): LocalIdentityController {
		return localIdentity.get();
	}

	static access(): AccessController {
		return access.get();
	}

	static signIn(): ISignIn {
		return signIn.get();
	}

	static isAuthEnabled(): boolean {
		return authenticationEnabled();
	}
}
