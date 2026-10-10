import { ControllerBoundary } from '$lib/server/adapters/telemetry/controller-boundary';
import type { ControllerSurface } from '$lib/models/controller-boundary';
export const instrumentedController = <T extends object>(
	domain: string,
	controller: T,
	surface: ControllerSurface<T>,
	logger: Pick<Console, 'info' | 'debug' | 'warn' | 'error'> = console
): T => new ControllerBoundary(domain, controller, surface, logger).controller;
