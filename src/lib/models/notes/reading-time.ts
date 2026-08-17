/**
 * How long a note takes to read.
 *
 * Silent reading of prose sits somewhere in the 200–250 words-per-minute range depending on
 * who is measuring; the middle of it is close enough for a caption whose job is to say
 * "a moment" or "settle in", not to be accurate to the second.
 */
const WORDS_PER_MINUTE = 225;

/**
 * Whole minutes to read `words`.
 *
 * Rounded up, because a note that takes ninety seconds does not take one minute — and `0`
 * only for an empty note, so the caller can drop the clause entirely rather than print a
 * reading time of nothing.
 */
export const readingMinutes = (words: number): number => {
	if (words <= 0) return 0;
	return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
};
