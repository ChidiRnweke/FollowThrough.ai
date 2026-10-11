import { instrumentedController } from './controller-instrumentation';
import { accessSurface } from './controller-surfaces';
import { Access, type AccessController } from '../controllers/identity/access';
import type { McpSurfaceFactory } from './agent/mcp-tool-factory';
import type { ActorContext } from '$lib/models/identity';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { createProductionFactory, type ProductionApplication } from './production-factory';
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
import { authentikConfiguration, requestActor } from '../config';

class DeferredValue<T> {
	private value: T | undefined;

	constructor(private readonly create: () => T) {}

	get(): T {
		return (this.value ??= this.create());
	}
}

const application = new DeferredValue(createProductionFactory);
const sessions = new DeferredValue(() => new SessionRegistry(new SessionRecords(db)));
const access = new DeferredValue(() =>
	instrumentedController(
		'access',
		new Access({
			sessions: sessions.get(),
			tokens: new AccessTokens(new ApiTokenRecords(db)),
			provenance: application.get().provenance
		}),
		accessSurface
	)
);
const signIn = new DeferredValue(() => {
	const config = authentikConfiguration();
	return new SignIn({
		authorization: new OAuthAuthorization(new AuthentikClient(config), config),
		accounts: new ProviderAccounts(new UserRecords(db)),
		sessions: sessions.get()
	});
});

export class AppFactory {
	private static application(): ProductionApplication {
		return application.get();
	}

	static controllers(): ControllerFactory {
		return this.application().controllers;
	}

	static mcpSurface(...args: Parameters<McpSurfaceFactory>): ReturnType<McpSurfaceFactory> {
		return this.application().mcpSurface(...args);
	}

	static actor(locals?: App.Locals): ActorContext {
		return requestActor(locals?.user);
	}

	static access(): AccessController {
		return access.get();
	}

	static signIn(): ISignIn {
		return signIn.get();
	}
}
