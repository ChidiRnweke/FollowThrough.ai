import { getRequestEvent } from '$app/server';
import type { ActorContext } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';

/**
 * Actor for the current request. Remote functions get no `locals` parameter, and
 * `AppFactory.actor()` without them silently falls back to the local dev user —
 * which attributes every write to one placeholder account when auth is enabled.
 */
export const requestActor = (): ActorContext => AppFactory.actor(getRequestEvent().locals);
