/**
 * What an empty project space is *for*, said one way at a time.
 *
 * A resource with nothing in it renders a tip instead of a zero — a count of
 * none is a dead stat, while a tip is an invitation to act (see DESIGN_SYSTEM.md
 * "Empty states"). Tips rotate so the page teaches something different on a
 * return visit rather than nagging with the same line.
 *
 * Every line describes behaviour that actually exists. Keep it that way: a tip
 * that promises something the code does not do is worse than no tip. Voice rules
 * apply — calm, dry, second person, one sentence with a period, no exclamations.
 */
export type ResourceKey = 'todos' | 'memory' | 'artifacts' | 'attachments';

export const resourceTips: Record<ResourceKey, readonly string[]> = {
	// Grounded in the `extract_promises` pipeline and the `SourceAnchor` quote
	// every extracted todo carries back to its sentence.
	todos: [
		'Promises you make in a note get pulled out here.',
		'Every extracted todo keeps the sentence it came from.',
		'Give one a due date and it turns up on Today.'
	],
	// Grounded in MemoryEntryType (fact/decision/constraint/preference) and the
	// `shareWithAgents` flag that decides what reaches the agent.
	memory: [
		'Record a decision here and it outlives the note it came from.',
		'A constraint you save stops the agent suggesting what you ruled out.',
		'What you keep here is what the agent knows about this project.'
	],
	// Grounded in Artifact.format ('docx' | 'pdf') and sourceNoteIds.
	artifacts: [
		'Notes you export as docx or pdf land here.',
		'An export remembers which notes it was built from.'
	],
	// Grounded in TextAttachmentParser and the OCR path: both extract text on
	// upload so the agent can quote the source.
	attachments: [
		'PDFs, office documents and images are read on upload, so the agent can quote them.',
		'Give the agent source material and it answers from yours, not the void.'
	]
};

/**
 * Picks a tip for each resource from a seed.
 *
 * The seed must come from the loader, never from `Math.random()` at render time:
 * a value drawn during render differs between the server pass and hydration and
 * produces a hydration mismatch.
 */
export function pickTip(resource: ResourceKey, seed: number): string {
	const tips = resourceTips[resource];
	// Offset per resource so one seed does not lock every space to the same index.
	const offset = resource.length;
	return tips[Math.abs(seed + offset) % tips.length];
}
