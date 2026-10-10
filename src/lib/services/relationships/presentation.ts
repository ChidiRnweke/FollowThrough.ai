import type { BacklinkView, BacklinkContext } from '$lib/models/relationships';

function assembleBacklinkView(
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

export interface BacklinkPresentation {
	assembleBacklinkView(
		relationship: BacklinkContext['relationship'],
		source: BacklinkContext['source'],
		target: BacklinkContext['target']
	): BacklinkView;
}
export class BacklinkPresentationService implements BacklinkPresentation {
	assembleBacklinkView(
		relationship: BacklinkContext['relationship'],
		source: BacklinkContext['source'],
		target: BacklinkContext['target']
	): BacklinkView {
		return assembleBacklinkView(relationship, source, target);
	}
}
