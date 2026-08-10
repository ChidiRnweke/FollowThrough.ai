/**
 * A sent question is meant to sit at the top of the scroll port while its answer is
 * written beneath it. That is only possible if there is something to scroll into: with
 * the turn stack ending flush against the bottom of the content, the newest question
 * cannot travel any further up than the last screenful of transcript allows.
 *
 * So the thread reserves the difference. The filler goes *below* the last turn, sized
 * to whatever the turn itself does not already cover, and collapses to nothing once the
 * answer has grown past a screenful and can hold the top on its own.
 */
export function anchorSpacerHeight(measurements: {
	/** Visible height of the scroll port. */
	viewportHeight: number;
	/** Height of the turn stack, excluding the filler this function sizes. */
	stackHeight: number;
	/** Offset of the newest question's top edge within the turn stack. */
	questionOffset: number;
}): number {
	const fromQuestionToEnd = measurements.stackHeight - measurements.questionOffset;
	return Math.max(0, measurements.viewportHeight - fromQuestionToEnd);
}
