import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import type {
	CreateProjectInput,
	RenameProjectInput,
	ArchiveProjectInput,
	CreateFolderInput,
	MoveProjectEntryInput,
	CreateNoteInput,
	RenameNoteInput,
	ArchiveNoteInput,
	CreateSkillInput
} from '$lib/models';

export const createProject = command(z.object({ name: z.string().min(1) }), async (input) => {
	return AppFactory.controllerFactory()
		.projects()
		.create(AppFactory.actor(), input as CreateProjectInput);
});

export const renameProject = command(
	z.object({ projectId: z.string().uuid(), name: z.string().min(1) }),
	async (input) => {
		return AppFactory.controllerFactory()
			.projects()
			.rename(AppFactory.actor(), input as RenameProjectInput);
	}
);

export const archiveProject = command(z.object({ projectId: z.string().uuid() }), async (input) => {
	return AppFactory.controllerFactory()
		.projects()
		.archive(AppFactory.actor(), input as ArchiveProjectInput);
});

export const createFolder = command(
	z.object({
		projectId: z.string().uuid(),
		name: z.string().min(1),
		parentId: z.string().uuid().optional()
	}),
	async (input) => {
		return AppFactory.controllerFactory()
			.projects()
			.createFolder(AppFactory.actor(), input as CreateFolderInput);
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
		return AppFactory.controllerFactory()
			.projects()
			.move(AppFactory.actor(), input as MoveProjectEntryInput);
	}
);

export const createNote = command(
	z.object({
		title: z.string().min(1),
		projectId: z.string().uuid().optional(),
		parentId: z.string().uuid().optional()
	}),
	async (input) => {
		return AppFactory.controllerFactory()
			.notes()
			.create(AppFactory.actor(), input as CreateNoteInput);
	}
);

export const renameNote = command(
	z.object({ noteId: z.string().uuid(), title: z.string().min(1) }),
	async (input) => {
		return AppFactory.controllerFactory()
			.notes()
			.rename(AppFactory.actor(), input as RenameNoteInput);
	}
);

export const archiveNote = command(z.object({ noteId: z.string().uuid() }), async (input) => {
	return AppFactory.controllerFactory()
		.notes()
		.archive(AppFactory.actor(), input as ArchiveNoteInput);
});

export const createSkill = command(
	z.object({
		name: z.string().min(1),
		projectId: z.string().uuid().optional(),
		parentId: z.string().uuid().optional()
	}),
	async (input) => {
		return AppFactory.controllerFactory()
			.skills()
			.create(AppFactory.actor(), input as CreateSkillInput);
	}
);
