import type {
	CreateMemoryEntryInput,
	UpdateMemoryEntryInput,
	MemoryEntry,
	MemoryEntryId
} from '$lib/models/memory';
import type { UserId } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';

export function decideMemoryCreation(
	input: CreateMemoryEntryInput,
	context: { readonly id: MemoryEntryId; readonly userId: UserId; readonly timestamp: DateTime }
): { kind: 'invalid'; message: string } | { kind: 'create'; entry: MemoryEntry } {
	const content = input.content.trim();
	if (!content) return { kind: 'invalid', message: 'Memory entry content is required' };
	return {
		kind: 'create',
		entry: {
			id: context.id,
			userId: context.userId,
			...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
			content,
			...(input.type !== undefined ? { type: input.type } : {}),
			shareWithAgents: input.shareWithAgents ?? true,
			createdAt: context.timestamp,
			updatedAt: context.timestamp
		}
	};
}

export function decideMemoryEdit(
	current: MemoryEntry,
	input: Omit<UpdateMemoryEntryInput, 'memoryEntryId'>,
	timestamp: DateTime
): { kind: 'invalid'; message: string } | { kind: 'edit'; entry: MemoryEntry } {
	const content = input.content?.trim() ?? current.content;
	if (!content) return { kind: 'invalid', message: 'Memory entry content is required' };
	return {
		kind: 'edit',
		entry: {
			...current,
			content,
			...(input.type !== undefined ? { type: input.type ?? undefined } : {}),
			shareWithAgents: input.shareWithAgents ?? current.shareWithAgents,
			updatedAt: timestamp
		}
	};
}
