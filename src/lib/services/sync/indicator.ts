import type { SyncIndicatorInput } from '$lib/models/sync';

export const syncIndicator = (
	input: SyncIndicatorInput
): {
	kind: 'synced' | 'saving' | 'offline' | 'downloading' | 'attention';
	headline: string;
	description: string;
	badge: number;
} => {
	if (input.review || input.failedDownloads || input.failure)
		return {
			kind: 'attention',
			headline: input.review
				? `${input.review} ${input.review === 1 ? 'change needs' : 'changes need'} a decision`
				: 'Sync needs attention',
			description:
				input.failure ??
				(input.failedDownloads
					? `${input.failedDownloads} saved copies could not be downloaded. Retry to complete your workspace.`
					: 'Review the versions and choose which changes to keep.'),
			badge: input.review
		};
	if (!input.online)
		return {
			kind: 'offline',
			headline: "You're offline",
			description: input.pending
				? `${input.pending} ${input.pending === 1 ? 'change' : 'changes'} will sync when you're back online.`
				: 'Downloaded content remains available on this device.',
			badge: input.pending
		};
	if (input.pending || input.sending)
		return {
			kind: 'saving',
			headline: 'Saving your changes',
			description: 'Your changes are saved on this device while they sync.',
			badge: 0
		};
	if (input.downloading)
		return {
			kind: 'downloading',
			headline: 'Downloading your workspace',
			description: 'Saved copies are becoming available for offline use.',
			badge: 0
		};
	return {
		kind: 'synced',
		headline: 'Everything is saved',
		description: 'Your workspace is up to date on this device.',
		badge: 0
	};
};
