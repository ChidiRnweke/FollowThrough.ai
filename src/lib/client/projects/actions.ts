import { workspaceAccountHint } from '$lib/client/sync/bootstrap-storage';
import { isHttpError } from '@sveltejs/kit';
import type {
	ProjectActionRemote,
	ProjectActionEnvironment
} from '$lib/controllers/projects/actions';
import {
	moveEntry,
	createSkill,
	deleteNoteForever,
	emptyNoteTrash
} from '$lib/remote/projects/projects.remote';
export class RemoteProjectActions implements ProjectActionRemote {
	move(input: Parameters<ProjectActionRemote['move']>[0]) {
		return moveEntry(input);
	}
	createSkill(input: Parameters<ProjectActionRemote['createSkill']>[0]) {
		return createSkill(input);
	}
	deleteNote(input: Parameters<ProjectActionRemote['deleteNote']>[0]) {
		return deleteNoteForever(input);
	}
	emptyTrash(input: Parameters<ProjectActionRemote['emptyTrash']>[0]) {
		return emptyNoteTrash(input);
	}
}
export class BrowserProjectActions implements ProjectActionEnvironment {
	get accountId(): string | null {
		return workspaceAccountHint(document.cookie);
	}
	identity(): string {
		return crypto.randomUUID();
	}
	async attempt<T>(
		operation: () => Promise<T>
	): Promise<{ kind: 'success'; value: T } | { kind: 'failure'; message: string }> {
		try {
			return { kind: 'success', value: await operation() };
		} catch (error) {
			return {
				kind: 'failure',
				message: isHttpError(error)
					? error.body.message
					: error instanceof Error
						? error.message
						: 'The action could not be saved'
			};
		}
	}
}
