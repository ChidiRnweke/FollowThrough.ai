import type { NoteView as AggregateNoteView } from '$lib/models/notes';
import type { BacklinkView } from '$lib/models/relationships';
import type { ReferenceView } from '$lib/models/references';
import type { Diagram } from '$lib/models/diagrams';
import type { TodoView } from '$lib/models/todos';
import type { SuggestionView } from '$lib/models/suggestions';

export type NoteView = AggregateNoteView<
	BacklinkView,
	ReferenceView,
	Diagram,
	TodoView,
	SuggestionView
>;
