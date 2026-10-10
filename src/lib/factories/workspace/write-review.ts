import { WriteReviewPresentationService } from '$lib/services/workspace/write-review';
import {
	WriteReviewOperations,
	type WriteReviewController
} from '$lib/controllers/workspace/write-review';
export const writeReviewOperations: WriteReviewController = new WriteReviewOperations(
	new WriteReviewPresentationService()
);
