import type { ScheduledTask } from '$lib/models/maintenance';
import type { McpClientRetention } from '$lib/server/services/identity/mcp-clients';

export interface UnusedClientSweepSettings {
	/** How long a registration may go without a code before it is deleted. */
	readonly retentionMs: number;
	readonly intervalMs: number;
}

/**
 * Deletes anonymous MCP client registrations that no client came back to.
 *
 * `/oauth/register` creates a row for any caller, before any user is known (ADR 0050). A row
 * grants nothing without a user's consent, but nothing else removes one, so rows from abandoned
 * or repeated registrations would accumulate without bound. A registration is used each time a
 * code is issued to it; one that stays unused past the retention, and that no live connection or
 * pending code names, is deleted. A client that comes back later is refused as unregistered and
 * registers again.
 */
export class UnusedClientSweep implements ScheduledTask {
	readonly name = 'unused-mcp-client-sweep';
	readonly intervalMs: number;

	constructor(
		private readonly clients: McpClientRetention,
		private readonly settings: UnusedClientSweepSettings,
		private readonly now: () => Date = () => new Date(),
		private readonly logger: Pick<Console, 'log'> = console
	) {
		this.intervalMs = settings.intervalMs;
	}

	async run(): Promise<void> {
		const removed = await this.clients.removeUnused(
			new Date(this.now().getTime() - this.settings.retentionMs)
		);
		if (removed > 0) this.logger.log(`[${this.name}] deleted ${removed} unused registration(s)`);
	}
}
