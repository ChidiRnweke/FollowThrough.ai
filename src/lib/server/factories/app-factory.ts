import { instrumentedController } from './controller-instrumentation';
import { accessSurface, authenticationSurface } from './controller-surfaces';
import { Access, type AccessController } from '../controllers/identity/access';
import { createMcpToolSurface, type McpSurfaceFactory } from './agent/mcp-tool-factory';
import type { ActorContext } from '$lib/models/identity';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import type { SystemControllers } from './system-factory';
import {
	Authentication,
	type AuthenticationController
} from '../controllers/identity/authentication';
import { createProductionComposition } from './production-factory';
import { SessionRegistry } from '$lib/server/services/identity/sessions';
import { AccessTokens, TokenVerification } from '$lib/server/services/identity/api-tokens';
import {
	ApiTokenCredentialRecords,
	ApiTokenRecords
} from '../repositories/identity/postgres/api-tokens';
import { SignIn, type ISignIn } from '$lib/server/controllers/identity/controller';
import { OAuthAuthorization } from '$lib/server/services/identity/oauth-authorization';
import { ProviderAccounts } from '$lib/server/services/identity/provider-accounts';
import { AuthentikClient } from '$lib/server/repositories/identity/authentik';
import { SessionRecords } from '../repositories/identity/postgres/sessions';
import { UserAccountRecords } from '../repositories/identity/postgres/users';
import { db } from '../db';
import { authentikConfiguration, requestActor } from '../config';

class DeferredValue<T> {
	private value: T | undefined;

	constructor(private readonly create: () => T) {}

	get(): T {
		return (this.value ??= this.create());
	}
}

const composition = new DeferredValue(createProductionComposition);
const sessions = new DeferredValue(() => new SessionRegistry(new SessionRecords(db)));
const authentication = new DeferredValue(() =>
	instrumentedController(
		'authentication',
		new Authentication({
			sessions: sessions.get(),
			tokens: new TokenVerification(new ApiTokenCredentialRecords(db))
		}),
		authenticationSurface
	)
);
const signIn = new DeferredValue(() => {
	const config = authentikConfiguration();
	return new SignIn({
		authorization: new OAuthAuthorization(new AuthentikClient(config), config),
		accounts: new ProviderAccounts(new UserAccountRecords(db)),
		sessions: sessions.get()
	});
});

export class AppFactory {
	/** The controllers for one user: a request's authenticated actor. */
	static forActor(actor: ActorContext): ControllerFactory {
		return composition.get().forActor(actor).controllers;
	}

	/** The controllers for work that acts for no user: startup recovery lists runs here. */
	static system(): SystemControllers {
		return composition.get().system().controllers;
	}

	static mcpSurface(...args: Parameters<McpSurfaceFactory>): ReturnType<McpSurfaceFactory> {
		return createMcpToolSurface(...args);
	}

	static actor(locals?: App.Locals): ActorContext {
		return requestActor(locals?.user);
	}

	/** Establishes who a request acts for; it runs before any user is known. */
	static authentication(): AuthenticationController {
		return authentication.get();
	}

	static access(actor: ActorContext): AccessController {
		return instrumentedController(
			'access',
			new Access(actor, {
				tokens: new AccessTokens(new ApiTokenRecords(actor, db)),
				provenance: composition.get().forActor(actor).provenance
			}),
			accessSurface
		);
	}

	static signIn(): ISignIn {
		return signIn.get();
	}
}
