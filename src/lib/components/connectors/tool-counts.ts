import type { ConnectorToolCounts } from '$lib/models/connectors';

/** "12 tools · 3 ask first · 1 off": what a connector offers the agent, in one caption. */
export const toolCountsCaption = (counts: ConnectorToolCounts): string =>
	[
		counts.total === 0 ? 'No tools' : `${counts.total} ${counts.total === 1 ? 'tool' : 'tools'}`,
		counts.asking > 0 ? `${counts.asking} ask first` : undefined,
		counts.off > 0 ? `${counts.off} off` : undefined,
		counts.unusable > 0 ? `${counts.unusable} unusable` : undefined
	]
		.filter((part) => part !== undefined)
		.join(' · ');
