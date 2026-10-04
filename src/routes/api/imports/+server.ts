// chisel-ignore-file route-style:prefer-remote-function -- Multipart archive uploads require File handling before archive admission and decoding.
import { archiveAdmissionLimits } from '$lib/server/config';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import { ValidationError } from '$lib/errors';
import { AppFactory } from '$lib/server/factories/app-factory';
import type { RequestHandler } from './$types';
import {
	readMarkdownArchive,
	parseMarkdownNote,
	describeArchiveRejection
} from '$lib/remote/notes/archive-reader.server';

/**
 * Bulk note import.
 *
 * A plain multipart endpoint rather than a remote command or the presigned-S3 attachment
 * flow: a `File` this size does not travel well through a remote function, and the zip is
 * a throwaway — putting it in the attachments table would pollute a user-facing list and
 * leave an object in storage that nothing ever reads again. The byte source is handed to
 * the upload reader at this boundary. The controller receives parsed note entries.
 */

const id = z.string().uuid();

const fieldsSchema = z.object({ projectId: id, parentId: id.optional() });

export const POST: RequestHandler = async ({ request, locals }) => {
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
		const archive = readMarkdownArchive(
			new Uint8Array(await file.arrayBuffer()),
			archiveAdmissionLimits()
		);
		if (!archive.ok) throw new ValidationError(describeArchiveRejection(archive.rejection));
		const report = await AppFactory.controllers()
			.notes()
			.importMarkdownArchive(AppFactory.actor(locals), {
				projectId: fields.data.projectId as ProjectId,
				...(fields.data.parentId ? { parentId: fields.data.parentId as NoteId } : {}),
				notes: archive.result.entries.map(parseMarkdownNote),
				skipped: archive.result.skipped
			});
		return json(report);
	} catch (error) {
		// A rejected archive is the user's problem to fix, so it reads as a message rather
		// than a 500 they can do nothing about.
		if (error instanceof ValidationError) return json({ message: error.message }, { status: 400 });
		throw error;
	}
};
