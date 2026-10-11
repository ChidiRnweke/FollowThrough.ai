import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { type WorkspaceWriteReviewEntry as Entry } from '$lib/models/workspace-write-review';
import type { WriteReviewPresentation } from '$lib/services/workspace/write-review';

export interface WriteReviewController {
	writeTitle(entry: Entry): string;
	writeGroup(entry: Entry): 'decision' | 'waiting' | 'sending';
	writeStatus(entry: Entry): string;
	writeExplanation(entry: Entry, online: boolean): string;
	visibleReviewFields(
		record: WorkspaceRecord,
		title: string
	): ReturnType<WriteReviewPresentation['visibleReviewFields']>;
	hasReviewContent(record: WorkspaceRecord | null, title: string): boolean;
}
export class WriteReviewOperations implements WriteReviewController {
	constructor(private readonly writeReviewPresentation: WriteReviewPresentation) {}
	readonly writeTitle = (entry: Entry): string => this.writeReviewPresentation.writeTitle(entry);
	readonly writeGroup = (entry: Entry): 'decision' | 'waiting' | 'sending' =>
		this.writeReviewPresentation.writeGroup(entry);
	readonly writeStatus = (entry: Entry): string => this.writeReviewPresentation.writeStatus(entry);
	readonly writeExplanation = (entry: Entry, online: boolean): string =>
		this.writeReviewPresentation.writeExplanation(entry, online);
	readonly visibleReviewFields = (
		record: WorkspaceRecord,
		title: string
	): ReturnType<WriteReviewPresentation['visibleReviewFields']> =>
		this.writeReviewPresentation.visibleReviewFields(record, title);
	readonly hasReviewContent = (record: WorkspaceRecord | null, title: string): boolean =>
		this.writeReviewPresentation.hasReviewContent(record, title);
}
