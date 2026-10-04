import { ValidationError } from '$lib/errors';
import type {
	AgentModel,
	AgentRunImages,
	ConversationImageInput,
	RunAgentInput
} from '$lib/models/agent';

type ImageRequest = Pick<RunAgentInput, 'images' | 'contextImages'>;
const imagesForRun = (request: ImageRequest): readonly ConversationImageInput[] => [
	...(request.images ?? []),
	...(request.contextImages ?? [])
];

/** Both image channels use the same format validation. */
export function validateRunImages(request: ImageRequest): void {
	for (const image of imagesForRun(request)) {
		if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mediaType))
			throw new ValidationError('Chat images must be PNG, JPEG, or WebP.');
		if (!image.dataUrl.startsWith(`data:${image.mediaType};base64,`))
			throw new ValidationError('Chat image content does not match its media type.');
	}
}

/** Freeze native vision or the resolved fallback reader onto the durable request. */
export function freezeImageReader(
	request: RunAgentInput,
	models: readonly AgentModel[],
	chatModel: string,
	visionModel: string
): RunAgentInput {
	if (models.find((model) => model.id === chatModel)?.supportsVision) {
		const { visionModelOverride: _discarded, ...native } = request;
		void _discarded;
		return native;
	}
	return { ...request, visionModelOverride: visionModel };
}

/** Interpret the saved reader once; providers receive the resolved mode and image list. */
export function prepareRunImages(
	request: Pick<RunAgentInput, 'images' | 'contextImages' | 'visionModelOverride'>
): AgentRunImages {
	const images = imagesForRun(request);
	if (images.length === 0) return { kind: 'none' };
	return request.visionModelOverride
		? { kind: 'describe', images, model: request.visionModelOverride }
		: { kind: 'native', images };
}
