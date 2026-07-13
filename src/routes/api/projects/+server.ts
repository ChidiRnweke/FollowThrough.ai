import { json } from '@sveltejs/kit';
import type {
	ArchiveProjectInput,
	CreateFolderInput,
	CreateProjectInput,
	MoveProjectEntryInput,
	RenameProjectInput
} from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

type ProjectOperation =
	| ({ op: 'create' } & CreateProjectInput)
	| ({ op: 'rename' } & RenameProjectInput)
	| ({ op: 'archive' } & ArchiveProjectInput)
	| ({ op: 'createFolder' } & CreateFolderInput)
	| ({ op: 'move' } & MoveProjectEntryInput);

export const POST: RequestHandler = async ({ request }) => {
	const { op, ...input } = (await request.json()) as ProjectOperation;
	const projects = AppFactory.controllerFactory().projects();
	const actor = AppFactory.actor();
	switch (op) {
		case 'create':
			return json(await projects.create(actor, input as CreateProjectInput));
		case 'rename':
			return json(await projects.rename(actor, input as RenameProjectInput));
		case 'archive':
			return json(await projects.archive(actor, input as ArchiveProjectInput));
		case 'createFolder':
			return json(await projects.createFolder(actor, input as CreateFolderInput));
		case 'move':
			return json(await projects.move(actor, input as MoveProjectEntryInput));
		default:
			return json({ error: 'Unknown operation' }, { status: 400 });
	}
};
