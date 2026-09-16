import { z } from 'zod';

export const workbenchTabIdSchema = z.union([
	z.uuid(),
	z
		.string()
		.regex(/^(?:chat:|diagram:)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
	z.literal('search')
]);

/** Device-local layout for one account. URLs remain the source of navigation focus. */
export const workbenchLayoutSchema = z.object({
	id: z.literal('current'),
	openTabs: z.array(workbenchTabIdSchema).readonly(),
	focusedNoteId: workbenchTabIdSchema.nullable(),
	pinnedTabs: z.array(workbenchTabIdSchema).readonly(),
	recentlyUsed: z.array(workbenchTabIdSchema).readonly(),
	stripHidden: z.boolean(),
	splitRatio: z.number().min(0.25).max(0.75)
});
export type WorkbenchLayoutRecord = z.infer<typeof workbenchLayoutSchema>;
