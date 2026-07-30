import { getRequestEvent } from '$app/server';
import type { ActorContext } from '$lib/models';
import { AppFactory } from './app-factory';

export const requestActor = (): ActorContext => AppFactory.actor(getRequestEvent().locals);
