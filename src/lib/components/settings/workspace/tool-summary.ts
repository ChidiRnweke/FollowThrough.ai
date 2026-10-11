/**
 * The line Settings shows under a tool's name. Tool descriptions are written for the
 * model, and mutation tools open with "Mutating tool." so the model knows the call
 * writes. The page already groups tools under Changes, so the marker only repeats
 * itself there.
 */
export const toolSummary = (description: string): string =>
	description.replace(/^Mutating tool\.\s*/, '');
