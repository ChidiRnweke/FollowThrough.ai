import type { ActorContext } from '$lib/models/identity';
import type { Note, NoteId } from '$lib/models/notes';
import type { NoteCatalog } from '$lib/server/services/notes/catalog';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';

export const storedNote = (
	catalog: NoteCatalog,
	actor: ActorContext,
	input: Pick<Note, 'projectId' | 'title' | 'kind'>
): Promise<Note> =>
	catalog.insert(
		actor,
		noteBuilder({
			...input,
			userId: actor.userId,
			id: crypto.randomUUID() as NoteId,
			document: { type: 'doc', content: [] },
			plainText: ''
		})
	);
