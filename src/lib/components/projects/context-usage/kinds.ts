import type { ContextItem } from '$lib/models/context-usage';

/** The reader's word for each kind, singular and plural. Never "attachment" or "memory entry". */
export const kindNoun: Readonly<Record<ContextItem['kind'], readonly [string, string]>> = {
	note: ['Note', 'Notes'],
	attachment: ['File', 'Files'],
	memory: ['Memory', 'Memory'],
	skill: ['Skill', 'Skills']
};
