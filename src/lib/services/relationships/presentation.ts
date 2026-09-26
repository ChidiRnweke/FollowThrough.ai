import type { BacklinkView, BacklinkContext } from '$lib/models/relationships';

export function assembleBacklinkView(
	relationship: BacklinkContext['relationship'],
	source: BacklinkContext['source'],
	target: BacklinkContext['target']
): BacklinkView {
	return {
		relationship,
		sourceNote: { id: source.id, title: source.title },
		targetNote: { id: target.id, title: target.title }
	};
}
