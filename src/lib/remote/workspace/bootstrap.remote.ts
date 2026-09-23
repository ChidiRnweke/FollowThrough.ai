import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

export const readWorkspaceBootstrap = command(z.object({}), async () =>
	AppFactory.controllers().agentSettings().bootstrap(requestActor())
);
