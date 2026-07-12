import type { ActorContext } from '$lib/models';
import { DemoControllerFactory, demoIds, type ControllerFactory } from '$lib/factories';
import { createProductionFactory } from './production-factory';

export class AppFactory {
	static controllerFactory(): ControllerFactory {
		switch (process.env.APP_MODE) {
			case 'production':
				return createProductionFactory();
			case 'demo-empty':
				return new DemoControllerFactory('empty');
			case 'demo-error':
				return new DemoControllerFactory('error');
			default:
				return new DemoControllerFactory();
		}
	}
	static actor(): ActorContext {
		return { userId: demoIds.user };
	}
}
