import { json } from '@sveltejs/kit';
import type {
	ArchiveNoteInput,
	CreateNoteInput,
	RenameNoteInput,
	SaveNoteInput
} from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const factory = AppFactory.controllerFactory();
	const actor = AppFactory.actor();
	if (body.op === 'rename') {
		const input = body as RenameNoteInput;
		return json(await factory.notes().rename(actor, input));
	}
	if ('title' in body && !('document' in body)) {
		const input = body as CreateNoteInput;
		return json(await factory.notes().create(actor, input));
	}
	const input = body as SaveNoteInput;
	return json(await factory.notes().save(actor, input));
};

export const DELETE: RequestHandler = async ({ request }) => {
	const input = (await request.json()) as ArchiveNoteInput;
	const factory = AppFactory.controllerFactory();
	return json(await factory.notes().archive(AppFactory.actor(), input));
};
