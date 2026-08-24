import type { TabId } from '$lib/stores/workbench/tab-ref';
import type { CanvasSubject } from './canvas-subject';

/**
 * The tab a conversation's *kept* diagram would be shown in.
 *
 * Three arms rather than an optional tab: the lookup being out is not the same
 * as having none, and must not act like it.
 */
export type KeptStudioTab =
	| { readonly kind: 'pending' }
	| { readonly kind: 'unkept' }
	| { readonly kind: 'kept'; readonly tab: TabId };

/** What the canvas is showing and where it belongs, as one value. */
export type CanvasPlacement =
	/** The kept-diagram lookup is still out. */
	| { readonly kind: 'pending' }
	| { readonly kind: 'none' }
	| { readonly kind: 'showing'; readonly subject: CanvasSubject; readonly tab: TabId };

const PENDING: CanvasPlacement = { kind: 'pending' };
const NONE: CanvasPlacement = { kind: 'none' };

/**
 * Where the canvas belongs, decided once.
 *
 * The chat pane and the chat panel each combined these two facts themselves, and
 * each got it wrong the same way: both read "this conversation has kept a
 * diagram" as if it answered "the canvas is showing what the agent just drew".
 * Those are different questions. The pane sent every new version to the kept
 * diagram's tab — the tab already on screen, holding the version before it — and
 * the panel decided the canvas was therefore already visible and withheld the
 * offer. A diagram the agent had just changed had no tab and no way in.
 *
 * Only a *draft* defers to the kept diagram. Keeping swaps the draft tab for the
 * saved one while the transcript goes on saying draft, so a kept draft is shown
 * by the diagram it became. A subject that already names a diagram names the
 * right one, and overriding that is the defect above.
 */
export const canvasPlacementOf = (
	subject: CanvasSubject | undefined,
	canvasTab: TabId,
	kept: KeptStudioTab
): CanvasPlacement => {
	if (kept.kind === 'pending') return PENDING;
	if (!subject) return NONE;
	const tab = subject.kind === 'draft' && kept.kind === 'kept' ? kept.tab : canvasTab;
	return { kind: 'showing', subject, tab };
};
