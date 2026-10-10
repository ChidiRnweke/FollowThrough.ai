const DESCRIBE_PROMPT =
	'Describe this image factually for search. Include visible text, charts, diagrams, objects, and layout. Do not make unsupported inferences.';

export interface ImageDescriptionInstructions {
	prepare(input: { context?: string }): string;
}
export class ImageDescriptionService implements ImageDescriptionInstructions {
	prepare(input: { context?: string }): string {
		return input.context
			? `This image appears in a document near the following text:\n${input.context}\n\n${DESCRIBE_PROMPT}`
			: DESCRIBE_PROMPT;
	}
}
