import type { AgentRunId } from '$lib/models/agent';
import type { NotificationChannel } from '$lib/server/db';
import type { AgentRunNotificationRepository } from '$lib/server/repositories/agent/run-notifications';

/** The `agent_run_changed` and `agent_run_event_appended` triggers notify `agent_run:<id>`. */
export class AgentRunNotificationRecords implements AgentRunNotificationRepository {
	constructor(private readonly channel: NotificationChannel) {}

	listen(runId: AgentRunId, listener: () => void): Promise<() => Promise<void>> {
		return this.channel.listen(`agent_run:${runId}`, listener);
	}
}
