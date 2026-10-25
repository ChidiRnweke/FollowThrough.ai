import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { inlineGroundingSnapshotSchema, type InlineGroundingSnapshot } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/inline-suggestions';
import { memoryEntries, searchChunks } from '$lib/server/db/schema/registry';
import type {
	InlineGroundingKey,
	InlineGroundingLookup,
	InlineGroundingMarkers,
	InlineGroundingRepository
} from '$lib/server/repositories/inline-suggestions/grounding';

/** `max(updated_at)` and `count(*)` of a corpus, as one comparable string. */
const fingerprint = (updatedAt: typeof searchChunks.updatedAt | typeof memoryEntries.updatedAt) =>
	sql<string>`coalesce(max(${updatedAt})::text, '') || ':' || count(*)`;

export class InlineGroundingRecords implements InlineGroundingRepository {
	constructor(
		private readonly actor: ActorContext,
		private readonly db: Database
	) {}

	async find(key: InlineGroundingKey, projectId: ProjectId): Promise<InlineGroundingLookup> {
		const snapshots = schema.inlineGroundingSnapshots;
		const [row] = await this.db
			.select({
				projectPassages: snapshots.projectPassages,
				userMemory: snapshots.userMemory,
				knowledgeMarker: snapshots.knowledgeMarker,
				memoryMarker: snapshots.memoryMarker
			})
			.from(snapshots)
			.where(
				and(
					eq(snapshots.userId, this.actor.userId),
					eq(snapshots.noteId, key.noteId),
					eq(snapshots.sectionKey, key.sectionKey)
				)
			);
		return {
			stored: row ? inlineGroundingSnapshotSchema.parse(row) : undefined,
			current: await this.markers(key.noteId, projectId)
		};
	}

	async put(key: InlineGroundingKey, snapshot: InlineGroundingSnapshot): Promise<void> {
		const snapshots = schema.inlineGroundingSnapshots;
		const content = {
			projectPassages: snapshot.projectPassages,
			userMemory: snapshot.userMemory,
			knowledgeMarker: snapshot.knowledgeMarker,
			memoryMarker: snapshot.memoryMarker
		};
		await this.db
			.insert(snapshots)
			.values({
				userId: this.actor.userId,
				noteId: key.noteId,
				sectionKey: key.sectionKey,
				...content
			})
			.onConflictDoUpdate({
				target: [snapshots.userId, snapshots.noteId, snapshots.sectionKey],
				set: { ...content, builtAt: new Date() }
			});
	}

	/**
	 * The note being written is left out of the knowledge fingerprint: autosave
	 * re-indexes it on nearly every pause, and retrieval already excludes its
	 * own chunks, so counting it would rebuild the grounding for nothing.
	 */
	private async markers(noteId: NoteId, projectId: ProjectId): Promise<InlineGroundingMarkers> {
		const [knowledge] = await this.db
			.select({ marker: fingerprint(searchChunks.updatedAt) })
			.from(searchChunks)
			.where(
				and(
					eq(searchChunks.userId, this.actor.userId),
					eq(searchChunks.projectId, projectId),
					or(isNull(searchChunks.noteId), ne(searchChunks.noteId, noteId))
				)
			);
		const [memory] = await this.db
			.select({ marker: fingerprint(memoryEntries.updatedAt) })
			.from(memoryEntries)
			.where(and(eq(memoryEntries.userId, this.actor.userId), isNull(memoryEntries.projectId)));
		if (!knowledge || !memory) throw new Error('An aggregate query returned no row');
		return { knowledge: knowledge.marker, memory: memory.marker };
	}
}
