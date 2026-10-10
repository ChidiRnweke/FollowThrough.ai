import type { StoredAgentRunEventRecord } from '$lib/models/agent';
import { noteActionResultSchema, type NoteActionEventRecord } from '$lib/models/note-actions';

/** Narrow workflow payloads before they enter the note controller. */
export class NoteActionEventReader {
	read(record: StoredAgentRunEventRecord): NoteActionEventRecord {
		if (record.kind === 'unreadable') return record;
		if (record.event.type !== 'workflow_result') return { ...record, event: record.event };
		return {
			...record,
			event: {
				type: 'workflow_result',
				result: noteActionResultSchema.parse({
					action: record.event.action,
					output: record.event.result
				})
			}
		};
	}
}
