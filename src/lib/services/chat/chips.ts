import type { ContextResourceRef } from '$lib/models/agent';
import type { ContextChip } from '$lib/models/chat';

/** A chip's identity: ids are only unique within a kind, so the kind is part of the key. */
const chipKeyOf = (chip: Pick<ContextChip, 'kind' | 'id'>): string => `${chip.kind}:${chip.id}`;

/** The resource a widget, diagram or file chip points at, as the run request carries it. */
const contextResourceRefOf = (chip: ContextChip): readonly ContextResourceRef[] => {
	switch (chip.kind) {
		case 'widget':
			return [{ kind: 'widget', id: chip.id }];
		case 'diagram':
			return [{ kind: 'diagram', id: chip.id }];
		case 'attachment':
			return [{ kind: 'attachment', id: chip.id }];
		case 'note':
		case 'skill':
		case 'folder':
		case 'selection':
			return [];
	}
};

/** One reference per resource, in first-attached order. */
const uniqueContextResources = (
	refs: readonly ContextResourceRef[]
): readonly ContextResourceRef[] => {
	const seen = new Set<string>();
	return refs.filter((ref) => {
		const key = chipKeyOf(ref);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

export interface ChatChipRules {
	key(chip: Pick<ContextChip, 'kind' | 'id'>): string;
	resources(chip: ContextChip): readonly ContextResourceRef[];
	unique(refs: readonly ContextResourceRef[]): readonly ContextResourceRef[];
}
export class ChatChipService implements ChatChipRules {
	key(chip: Pick<ContextChip, 'kind' | 'id'>): string {
		return chipKeyOf(chip);
	}
	resources(chip: ContextChip): readonly ContextResourceRef[] {
		return contextResourceRefOf(chip);
	}
	unique(refs: readonly ContextResourceRef[]): readonly ContextResourceRef[] {
		return uniqueContextResources(refs);
	}
}
