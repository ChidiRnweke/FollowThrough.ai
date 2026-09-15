import { z } from 'zod';
import { command } from '$app/server';
import { error } from '@sveltejs/kit';
import {
	workspaceMutationRequestSchema,
	workspaceWriteCancellationSchema
} from '$lib/models/workspace-mutations';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

export const cancelWorkspaceMutation = command(
	workspaceWriteCancellationSchema.extend({ accountId: z.string().uuid() }),
	async ({ accountId, ...input }) => {
		const actor = requestActor();
		if (actor.userId !== accountId) error(403, 'The synchronization account changed');
		return AppFactory.controllers().workspace().cancelMutation(actor, input);
	}
);

export const pushWorkspaceMutation = command(
	workspaceMutationRequestSchema.extend({ accountId: z.string().uuid() }),
	async (input) => {
		const { accountId, ...mutation } = input;
		const actor = requestActor();
		if (actor.userId !== accountId) error(403, 'The synchronization account changed');
		const controllers = AppFactory.controllers();
		const command = mutation.command;
		switch (command.kind) {
			case 'renameConversation':
				return controllers.agent().synchronize(actor, { ...mutation, command });
			case 'setToolPreference':
			case 'setProjectToolOverride':
			case 'resetProjectToolOverride':
				return controllers.toolPreferences().synchronize(actor, { ...mutation, command });
			case 'updateTrustPolicy':
				return controllers.trustPolicies().synchronize(actor, { ...mutation, command });
			case 'updateAgentPreferences':
				return controllers.agentSettings().synchronize(actor, { ...mutation, command });
			case 'updateUserPreferences':
				return controllers.userSettings().synchronize(actor, { ...mutation, command });
			case 'updateExportSettings':
				return controllers.deliverables().synchronize(actor, { ...mutation, command });
			case 'createMemory':
			case 'updateMemory':
			case 'deleteMemory':
				return controllers.memory().synchronize(actor, { ...mutation, command });
			case 'saveDiagram':
			case 'renameDiagram':
			case 'publishDiagram':
			case 'archiveDiagram':
			case 'restoreDiagram':
			case 'deleteDiagram':
				return controllers.diagramStudio().synchronize(actor, { ...mutation, command });
			case 'createProject':
			case 'renameProject':
			case 'archiveProject':
			case 'projectNumbering':
			case 'createFolder':
				return controllers.projects().synchronize(actor, { ...mutation, command });
			case 'createTodo':
			case 'updateTodo':
			case 'deleteTodo':
				return controllers.todos().synchronize(actor, { ...mutation, command });
			case 'updateSkill':
				return controllers.skills().synchronize(actor, { ...mutation, command });
			case 'createNote':
			case 'renameNote':
			case 'saveNote':
			case 'archiveNote':
			case 'restoreNote':
			case 'publishNote':
			case 'discardNoteDraft':
			case 'noteNumbering':
				return controllers.notes().synchronize(actor, { ...mutation, command });
			default:
				throw new Error(`Unhandled workspace command: ${command satisfies never}`);
		}
	}
);
