import type { InlineGroundingSnapshot } from '$lib/models/agent';
import type { ProjectId } from '$lib/models/projects';
import type {
	InlineGroundingKey,
	InlineGroundingLookup,
	InlineGroundingMarkers,
	InlineGroundingRepository
} from '$lib/server/repositories/inline-suggestions/grounding';

const keyOf = (key: InlineGroundingKey) => `${key.noteId}\u001f${key.sectionKey}`;

export class InMemoryInlineGrounding implements InlineGroundingRepository {
	readonly rows = new Map<string, InlineGroundingSnapshot>();
	/** What the corpus looks like now; a test moves one to simulate a change. */
	markers: InlineGroundingMarkers = { knowledge: 'knowledge-1', memory: 'memory-1' };

	async find(key: InlineGroundingKey, _projectId: ProjectId): Promise<InlineGroundingLookup> {
		return { stored: this.rows.get(keyOf(key)), current: this.markers };
	}

	async put(key: InlineGroundingKey, snapshot: InlineGroundingSnapshot): Promise<void> {
		this.rows.set(keyOf(key), snapshot);
	}
}
