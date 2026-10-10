import { NoteActionEventReader } from './action-event-reader';
import type { NoteActionEventRecord } from '$lib/models/note-actions';
import { RunEventSubscription } from '$lib/client/agent/runs/subscription';
import { cancelAgentRun } from '$lib/remote/agent/chat.remote';
import type { AgentRunId } from '$lib/models/agent';
import type { NoteActionRunTransport, NoteActionEventStream } from '$lib/models/browser-workspace';

export class BrowserNoteActionRunTransport implements NoteActionRunTransport {
	constructor(private readonly reader: NoteActionEventReader) {}
	open(
		runId: AgentRunId,
		after: string,
		onEvent: (record: NoteActionEventRecord) => void | Promise<void>
	): NoteActionEventStream {
		return new RunEventSubscription({
			runId,
			after,
			onOpen: () => {},
			onError: () => {},
			onEvent: (record) => onEvent(this.reader.read(record))
		});
	}
	async cancel(runId: AgentRunId): Promise<void> {
		await cancelAgentRun({ runId });
	}
}
