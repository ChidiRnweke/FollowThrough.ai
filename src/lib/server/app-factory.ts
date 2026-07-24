import type { ActorContext, UserId } from '$lib/models';
import type { ControllerFactory } from '$lib/factories';
import type { AgentEventBus } from './domain/agent-event-bus';
import { z } from 'zod';
import { createProductionFactory, type ProductionApplication } from './production-factory';
import { AuthService, type IAuthService } from '$lib/services/auth/authService';
import { AuthentikOAuthService } from '$lib/services/auth/authenthikAuthService';
import type { IOAuthService } from '$lib/services/auth/interfaces';
import { PostgresSessionRepository } from './repositories/postgres-sessions';
import { PostgresUserRepository } from './repositories/postgres-users';
import { db } from './db';

const localUserId = z
	.string()
	.uuid()
	.parse(process.env.LOCAL_USER_ID ?? '00000000-0000-4000-8000-000000000001') as UserId;

export class AppFactory {
	private static applicationInstance: ProductionApplication | undefined;
	private static authServiceInstance: IAuthService | undefined;
	private static oauthServiceInstance: IOAuthService | undefined;

	private static application(): ProductionApplication {
		return (this.applicationInstance ??= createProductionFactory());
	}

	static controllerFactory(): ControllerFactory {
		return this.application().controllers;
	}

	static recoverInterruptedRuns(): Promise<number> {
		return this.application().recoverInterruptedRuns();
	}

	static eventBus(): AgentEventBus {
		return this.application().eventBus;
	}

	static actor(): ActorContext {
		return { userId: localUserId };
	}

	static getAuthService(): IAuthService {
		if (!this.authServiceInstance) {
			const sessionRepo = new PostgresSessionRepository(db);
			this.authServiceInstance = new AuthService(sessionRepo);
		}
		return this.authServiceInstance;
	}

	static getOAuthService(): IOAuthService {
		if (!this.oauthServiceInstance) {
			const domain = process.env.AUTHENTIK_DOMAIN;
			const clientId = process.env.AUTHENTIK_CLIENT_ID;
			const clientSecret = process.env.AUTHENTIK_CLIENT_SECRET;
			const callbackUrl = process.env.AUTHENTIK_CALLBACK_URL;

			if (!domain || !clientId || !clientSecret || !callbackUrl) {
				throw new Error(
					'Authentik OAuth not configured. Set AUTHENTIK_DOMAIN, AUTHENTIK_CLIENT_ID, AUTHENTIK_CLIENT_SECRET, AUTHENTIK_CALLBACK_URL.'
				);
			}

			const userRepo = new PostgresUserRepository(db);
			const sessionRepo = new PostgresSessionRepository(db);
			this.oauthServiceInstance = new AuthentikOAuthService(userRepo, sessionRepo, {
				domain,
				clientId,
				clientSecret,
				callbackUrl
			});
		}
		return this.oauthServiceInstance;
	}

	static isAuthEnabled(): boolean {
		return Boolean(process.env.AUTHENTIK_CLIENT_ID?.trim());
	}
}
