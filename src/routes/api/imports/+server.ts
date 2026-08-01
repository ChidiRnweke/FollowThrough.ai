// chisel-ignore-file route-style:prefer-remote-function -- Multipart archive uploads require File handling and request-size checks before decoding.
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import { ValidationError } from '$lib/errors';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;

/**
 * Bulk note import.
 *
 * A plain multipart endpoint rather than a remote command or the presigned-S3 attachment
 * flow: a `File` this size does not travel well through a remote function, and the zip is
 * a throwaway — putting it in the attachments table would pollute a user-facing list and
 * leave an object in storage that nothing ever reads again. The byte source is handed to
 * the controller as a `Uint8Array`, so moving to presigned uploads later touches this
 * file alone.
 */

const id = z.string().uuid();

const fieldsSchema = z.object({ projectId: id, parentId: id.optional() });

export const POST: RequestHandler = async ({ request, locals }) => {
	// Checked before buffering: the point of a limit is not to read the body first.
	const declaredLength = Number(request.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > MAX_ARCHIVE_BYTES)
		return json(
			{
				message: `That archive is larger than the ${Math.round(MAX_ARCHIVE_BYTES / 1024 / 1024)} MB limit.`
			},
			{ status: 413 }
		);

	const form = await request.formData();
	const file = form.get('archive');
	if (!(file instanceof File)) return json({ message: 'Attach a .zip archive.' }, { status: 400 });

	const fields = fieldsSchema.safeParse({
		projectId: form.get('projectId'),
		...(form.get('parentId') ? { parentId: form.get('parentId') } : {})
	});
	if (!fields.success)
		return json({ message: 'Choose a project to import into.' }, { status: 400 });

	try {
		const report = await AppFactory.controllers()
			.imports()
			.importMarkdownArchive(AppFactory.actor(locals), {
				projectId: fields.data.projectId as ProjectId,
				...(fields.data.parentId ? { parentId: fields.data.parentId as NoteId } : {}),
				archive: new Uint8Array(await file.arrayBuffer()),
				fileName: file.name
			});
		return json(report);
	} catch (error) {
		// A rejected archive is the user's problem to fix, so it reads as a message rather
		// than a 500 they can do nothing about.
		if (error instanceof ValidationError) return json({ message: error.message }, { status: 400 });
		throw error;
	}
};
