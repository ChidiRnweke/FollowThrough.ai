import { z } from 'zod';
import { command } from '$app/server';
import { error } from '@sveltejs/kit';
import { workspaceMutationRequestSchema } from '$lib/models/workspace-mutations';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

export const pushWorkspaceMutation = command(
	workspaceMutationRequestSchema.extend({ accountId: z.string().uuid() }),
	async (input) => {
		const { accountId, ...mutation } = input;
		const actor = requestActor();
		if (actor.userId !== accountId) error(403, 'The synchronization account changed');
		const controllers = AppFactory.controllers();
		const command = mutation.command;
		switch (command.kind) {
			case 'createMemory':
			case 'updateMemory':
			case 'deleteMemory':
				return controllers.memory().synchronize(actor, { ...mutation, command });
			case 'saveDiagram':
			case 'renameDiagram':
			case 'publishDiagram':
			case 'restoreDiagramRevision':
			case 'archiveDiagram':
			case 'restoreDiagram':
			case 'deleteDiagram':
				return controllers.diagramStudio().synchronize(actor, { ...mutation, command });
			case 'createProject':
			case 'renameProject':
			case 'archiveProject':
			case 'projectNumbering':
			case 'createFolder':
			case 'moveNote':
				return controllers.projects().synchronize(actor, { ...mutation, command });
			case 'createTodo':
			case 'updateTodo':
			case 'deleteTodo':
				return controllers.todos().synchronize(actor, { ...mutation, command });
			case 'updateSkill':
			case 'createSkill':
				return controllers.skills().synchronize(actor, { ...mutation, command });
			default:
				return controllers.notes().synchronize(actor, { ...mutation, command });
		}
	}
);
