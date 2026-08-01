import type { ActorContext } from '$lib/models/identity';
import type { ControllerFactory } from '$lib/server/controller-factory';
import type { AgentEventBus } from './services/agent/runs/events';
import { createProductionFactory, type ProductionApplication } from './production-factory';
import { SessionRegistry, type ISessionRegistry } from '$lib/server/services/identity/sessions';
import { AccessTokens, type IAccessTokens } from '$lib/server/services/identity/api-tokens';
import type { ProvenanceRecorder } from './services/notes/provenance';
import type { ToolRetriever } from './services/agent/tools/tool-retriever';
import { ApiTokenRecords } from './repositories/identity/postgres/api-tokens';
import { SignIn } from '$lib/server/services/identity/sign-in';
import type { IOSessionRegistry } from '$lib/server/services/identity/sign-in';
import { SessionRecords } from './repositories/identity/postgres/sessions';
import { UserRecords } from './repositories/identity/postgres/users';
import { db } from './db';
import { authenticationEnabled, authentikConfiguration, requestActor } from './config';

class DeferredValue<T> {
	private value: T | undefined;

	constructor(private readonly create: () => T) {}

	get(): T {
		return (this.value ??= this.create());
	}
}

const application = new DeferredValue(createProductionFactory);
const sessions = new DeferredValue(() => new SessionRegistry(new SessionRecords(db)));
const accessTokens = new DeferredValue(() => new AccessTokens(new ApiTokenRecords(db)));
const signIn = new DeferredValue(
	() => new SignIn(new UserRecords(db), new SessionRecords(db), authentikConfiguration())
);

export class AppFactory {
	private static application(): ProductionApplication {
		return application.get();
	}

	static controllers(): ControllerFactory {
		return this.application().controllers;
	}

	static recoverInterruptedRuns(): Promise<number> {
		return this.application().recoverInterruptedRuns();
	}

	static eventBus(): AgentEventBus {
		return this.application().eventBus;
	}

	static provenance(): ProvenanceRecorder {
		return this.application().provenance;
	}

	static toolRetriever(): ToolRetriever {
		return this.application().toolRetriever;
	}

	static actor(locals?: App.Locals): ActorContext {
		return requestActor(locals?.user);
	}

	static sessions(): ISessionRegistry {
		return sessions.get();
	}

	static accessTokens(): IAccessTokens {
		return accessTokens.get();
	}

	static signIn(): IOSessionRegistry {
		return signIn.get();
	}

	static isAuthEnabled(): boolean {
		return authenticationEnabled();
	}
}
