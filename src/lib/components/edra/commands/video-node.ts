import { Video } from './Video.js';

/**
 * Schema and Markdown behaviour for videos, with no view layer attached.
 * Split from `VideoExtended.ts` for the same reason as `image-node.ts`.
 */
export const VideoNode = Video.extend({
	addAttributes() {
		return {
			src: { default: null },
			alt: { default: null },
			title: { default: null },
			width: { default: '100%' },
			height: { default: null },
			align: { default: 'left' }
		};
	}
});
