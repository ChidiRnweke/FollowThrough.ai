import type { ActorContext, UserId } from '$lib/models';
import type { ControllerFactory } from '$lib/factories';
import { z } from 'zod';
import { config } from 'dotenv';
import { createProductionFactory, type ProductionApplication } from './production-factory';

config({ quiet: true });

const localUserId = z
	.string()
	.uuid()
	.parse(process.env.LOCAL_USER_ID ?? '00000000-0000-4000-8000-000000000001') as UserId;

export class AppFactory {
	private static applicationInstance: ProductionApplication | undefined;

	private static application(): ProductionApplication {
		return (this.applicationInstance ??= createProductionFactory());
	}

	static controllerFactory(): ControllerFactory {
		return this.application().controllers;
	}

	static recoverInterruptedRuns(): Promise<number> {
		return this.application().recoverInterruptedRuns();
	}

	static actor(): ActorContext {
		return { userId: localUserId };
	}
}
