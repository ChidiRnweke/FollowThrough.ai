import { ControllerBoundary } from '$lib/server/infrastructure/telemetry/controller-boundary';
import type { BoundaryScope, ControllerSurface } from '$lib/models/controller-boundary';
export const instrumentedController = <T extends object>(
	domain: string,
	controller: T,
	surface: ControllerSurface<T>,
	scope: BoundaryScope,
	logger: Pick<Console, 'info' | 'debug' | 'warn' | 'error'> = console
): T => new ControllerBoundary(domain, controller, surface, scope, logger).controller;
