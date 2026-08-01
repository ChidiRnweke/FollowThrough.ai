import type { ConversationId, RunAgentInput } from '$lib/models/agent';
import type { Attachment } from '$lib/models/attachments';
import type { Note, NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { Todo, TodoId } from '$lib/models/todos';

type Extends<Left, Right> = Left extends Right ? true : false;
type Assert<Value extends true> = Value;
type Not<Value extends boolean> = Value extends true ? false : true;

export type ProjectIdFitsNoteProjectReference = Assert<Extends<ProjectId, Note['projectId']>>;
export type ProjectIdFitsTodoProjectReference = Assert<Extends<ProjectId, Todo['projectId']>>;
export type NoteIdFitsTodoSourceReference = Assert<
	Extends<NoteId, NonNullable<Todo['linkedNoteId']>>
>;
export type ProjectIdFitsAttachmentProjectReference = Assert<
	Extends<ProjectId, Attachment['projectId']>
>;
export type ProjectIdFitsAgentRunReference = Assert<
	Extends<ProjectId, NonNullable<RunAgentInput['projectId']>>
>;
export type ConversationIdFitsAgentRunReference = Assert<
	Extends<ConversationId, NonNullable<RunAgentInput['conversationId']>>
>;
export type ProjectIdRemainsDistinctFromTodoId = Assert<Not<Extends<ProjectId, TodoId>>>;
