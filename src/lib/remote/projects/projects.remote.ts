import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from '$lib/server/request-actor-factory';
import type {
	CreateProjectInput,
	RenameProjectInput,
	ArchiveProjectInput,
	CreateFolderInput,
	MoveProjectEntryInput
} from '$lib/models/projects';
import type { CreateNoteInput, RenameNoteInput, ArchiveNoteInput } from '$lib/models/notes';
import type { CreateSkillInput } from '$lib/models/skills';

export const createProject = command(z.object({ name: z.string().min(1) }), async (input) => {
	return AppFactory.controllers()
		.projects()
		.create(requestActor(), input as CreateProjectInput);
});

export const renameProject = command(
	z.object({ projectId: z.string().uuid(), name: z.string().min(1) }),
	async (input) => {
		return AppFactory.controllers()
			.projects()
			.rename(requestActor(), input as RenameProjectInput);
	}
);

export const archiveProject = command(z.object({ projectId: z.string().uuid() }), async (input) => {
	return AppFactory.controllers()
		.projects()
		.archive(requestActor(), input as ArchiveProjectInput);
});

export const createFolder = command(
	z.object({
		projectId: z.string().uuid(),
		name: z.string().min(1),
		parentId: z.string().uuid().optional()
	}),
	async (input) => {
		return AppFactory.controllers()
			.projects()
			.createFolder(requestActor(), input as CreateFolderInput);
	}
);

export const moveEntry = command(
	z.object({
		projectId: z.string().uuid(),
		entryId: z.string().uuid(),
		parentId: z.string().uuid().optional(),
		position: z.number().int().nonnegative()
	}),
	async (input) => {
		return AppFactory.controllers()
			.projects()
			.move(requestActor(), input as MoveProjectEntryInput);
	}
);

export const createNote = command(
	z.object({
		title: z.string().min(1),
		projectId: z.string().uuid().optional(),
		parentId: z.string().uuid().optional()
	}),
	async (input) => {
		return AppFactory.controllers()
			.notes()
			.create(requestActor(), input as CreateNoteInput);
	}
);

export const renameNote = command(
	z.object({ noteId: z.string().uuid(), title: z.string().min(1) }),
	async (input) => {
		return AppFactory.controllers()
			.notes()
			.rename(requestActor(), input as RenameNoteInput);
	}
);

export const archiveNote = command(z.object({ noteId: z.string().uuid() }), async (input) => {
	return AppFactory.controllers()
		.notes()
		.archive(requestActor(), input as ArchiveNoteInput);
});

export const createSkill = command(
	z.object({
		name: z.string().min(1),
		description: z.string().optional(),
		projectId: z.string().uuid().optional(),
		parentId: z.string().uuid().optional()
	}),
	async (input) => {
		return AppFactory.controllers()
			.skills()
			.create(requestActor(), input as CreateSkillInput);
	}
);
