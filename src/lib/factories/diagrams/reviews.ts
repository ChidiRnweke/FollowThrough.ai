import { BrowserDrawioLabelReader } from '$lib/client/diagrams/drawio/labels';
import { DiagramReviews, type DiagramReviewController } from '$lib/controllers/diagrams/reviews';
import { DiagramLabelPresentationService } from '$lib/services/diagrams/labels';
export const createDiagramReviews = (): DiagramReviewController =>
	new DiagramReviews(new BrowserDrawioLabelReader(), new DiagramLabelPresentationService());
