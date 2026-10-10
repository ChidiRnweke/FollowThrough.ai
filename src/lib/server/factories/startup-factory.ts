import { Startup, type StartupController } from '../controllers/startup/controller';
import { instrumentedController } from '../controllers/instrumentation';
import { internalControllerSurfaces } from './controller-surfaces';
import type { ControllerFactory } from './controller-factory';

export const createStartup = (controllers: ControllerFactory): StartupController =>
	instrumentedController(
		'startup',
		new Startup({
			agent: controllers.agent(),
			todos: controllers.todos(),
			references: controllers.references(),
			relationships: controllers.relationships(),
			diagrams: controllers.diagrams()
		}),
		internalControllerSurfaces.startup
	);
