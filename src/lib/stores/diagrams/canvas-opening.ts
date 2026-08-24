/**
 * When the canvas should open beside a conversation.
 *
 * The studio is a chat, so it starts as one: opening a canvas up front hands the
 * user an empty half-screen. It appears when there is something to show, and — the
 * part that needs a rule rather than a reflex — it must not spring straight back
 * after the user closes it.
 *
 * The rule is "open on a subject the canvas has not shown yet". Closing the canvas
 * leaves the current subject marked as shown, so it stays closed; the next revision
 * is a different subject and opens it again. That is ChatGPT's canvas behaviour, and
 * it means a re-render of the same diagram never fights the user.
 *
 * The subject is an opaque key rather than a source string, because what the canvas
 * shows may be a saved diagram rather than a draft — see `canvasSubjectKey`.
 */
export interface CanvasOpening {
	/** The subject the canvas has already been opened for, if any. */
	readonly shownKey?: string;
}

export const shouldOpenCanvas = (state: CanvasOpening, subjectKey: string): boolean =>
	subjectKey !== state.shownKey;

/** Records a subject as shown, whether it was opened for or dismissed. */
export const markCanvasShown = (subjectKey: string): CanvasOpening => ({ shownKey: subjectKey });
