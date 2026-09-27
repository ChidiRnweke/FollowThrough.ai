import { z } from 'zod';
import {
	importMarkdownArchiveOutputSchema,
	type ImportMarkdownArchiveOutput
} from '$lib/models/projects';

const failureSchema = z.object({ message: z.string() });
const unreadableReport =
	'The import finished, but its report could not be read. Reload to see what landed.';
const unreadableError =
	'The import returned an unreadable error. Check the project before trying again.';
export type ArchiveImportResponse =
	{ kind: 'report'; report: ImportMarkdownArchiveOutput } | { kind: 'failure'; message: string };

/** Decode the server's report without treating a completed import as an unsent upload. */
export async function readArchiveImportResponse(
	response: Response
): Promise<ArchiveImportResponse> {
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		return { kind: 'failure', message: response.ok ? unreadableReport : unreadableError };
	}
	if (!response.ok)
		return {
			kind: 'failure',
			message: failureSchema.safeParse(payload).data?.message ?? unreadableError
		};
	const parsed = importMarkdownArchiveOutputSchema.safeParse(payload);
	if (!parsed.success) return { kind: 'failure', message: unreadableReport };
	return { kind: 'report', report: parsed.data };
}
