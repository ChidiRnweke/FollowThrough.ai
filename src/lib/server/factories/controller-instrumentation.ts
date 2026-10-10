import { ControllerBoundary } from '$lib/server/adapters/telemetry/controller-boundary';
import { createTelemetryCapability } from '$lib/server/factories/telemetry';

import type { ControllerSurface } from '$lib/models/controller-boundary';
export const instrumentedController = <T extends object>(
	domain: string,
	controller: T,
	surface: ControllerSurface<T>,
	logger: Pick<Console, 'info' | 'debug' | 'warn' | 'error'> = console
): T => {
	const telemetry = createTelemetryCapability();
	return new ControllerBoundary(domain, controller, surface, {
		observer: telemetry.operations,
		logging: telemetry.logging,
		clock: telemetry.clock,
		logger
	}).controller;
};
