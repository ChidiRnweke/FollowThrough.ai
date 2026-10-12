import { and, eq, inArray, isNull } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { AttachmentId } from '$lib/models/attachments';
import type { AuthoredLinkRecord } from '$lib/models/context-usage';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/registry';
import type { ProjectLinkRepository } from '..';

const fileName = (path: string) => path.split('/').at(-1) ?? path;

/** Text the search index holds, so the agent can have read the file at all. */
const searchable = ['ready', 'partial'];

/**
 * The links the actor's records state inside one project. Each source is one row per link; a
 * pair linked two ways is two links, because each way is a separate statement.
 */
export class ProjectLinkRecords implements ProjectLinkRepository {
	constructor(
		private readonly actor: ActorContext,
		private readonly database: Database
	) {}

	async read(projectId: ProjectId): Promise<readonly AuthoredLinkRecord[]> {
		const [relationships, skills, attachments] = await Promise.all([
			this.relationships(projectId),
			this.skillUsages(projectId),
			this.noteAttachments(projectId)
		]);
		return [...relationships, ...skills, ...attachments];
	}

	/** A live note of this project and this actor, as a link endpoint. */
	private liveNote(
		note: Readonly<Record<'userId' | 'projectId' | 'kind' | 'archivedAt', AnyPgColumn>>,
		projectId: ProjectId
	) {
		return and(
			eq(note.userId, this.actor.userId),
			eq(note.projectId, projectId),
			eq(note.kind, 'note'),
			isNull(note.archivedAt)
		);
	}

	private async relationships(projectId: ProjectId): Promise<AuthoredLinkRecord[]> {
		const source = alias(schema.notes, 'source_note');
		const target = alias(schema.notes, 'target_note');
		const rows = await this.database
			.select({
				kind: schema.noteRelationships.kind,
				sourceId: source.id,
				sourceTitle: source.title,
				targetId: target.id,
				targetTitle: target.title
			})
			.from(schema.noteRelationships)
			.innerJoin(source, eq(source.id, schema.noteRelationships.sourceNoteId))
			.innerJoin(target, eq(target.id, schema.noteRelationships.targetNoteId))
			.where(
				and(
					eq(schema.noteRelationships.userId, this.actor.userId),
					this.liveNote(source, projectId),
					this.liveNote(target, projectId)
				)
			);
		return rows.map((row) => ({
			kind: row.kind,
			from: { kind: 'note', id: row.sourceId as NoteId, title: row.sourceTitle },
			to: { kind: 'note', id: row.targetId as NoteId, title: row.targetTitle }
		}));
	}

	private async skillUsages(projectId: ProjectId): Promise<AuthoredLinkRecord[]> {
		const context = alias(schema.notes, 'context_note');
		const skillNote = alias(schema.notes, 'skill_note');
		const rows = await this.database
			.select({
				skillId: skillNote.id,
				// `load_skill` reports the note's title as the skill's name, so both carry one title.
				skillTitle: skillNote.title,
				contextId: context.id,
				contextTitle: context.title
			})
			.from(schema.skillUsages)
			.innerJoin(context, eq(context.id, schema.skillUsages.contextNoteId))
			.innerJoin(skillNote, eq(skillNote.id, schema.skillUsages.skillNoteId))
			.where(
				and(
					this.liveNote(context, projectId),
					eq(skillNote.userId, this.actor.userId),
					isNull(skillNote.archivedAt)
				)
			);
		return rows.map((row) => ({
			kind: 'skill_used_in',
			from: { kind: 'skill', id: row.skillId as NoteId, title: row.skillTitle },
			to: { kind: 'note', id: row.contextId as NoteId, title: row.contextTitle }
		}));
	}

	private async noteAttachments(projectId: ProjectId): Promise<AuthoredLinkRecord[]> {
		const rows = await this.database
			.select({
				attachmentId: schema.attachments.id,
				path: schema.attachments.path,
				noteId: schema.notes.id,
				noteTitle: schema.notes.title
			})
			.from(schema.attachments)
			.innerJoin(schema.notes, eq(schema.notes.id, schema.attachments.noteId))
			.innerJoin(
				schema.attachmentVersions,
				eq(schema.attachmentVersions.id, schema.attachments.currentVersionId)
			)
			.where(
				and(
					eq(schema.attachments.userId, this.actor.userId),
					this.liveNote(schema.notes, projectId),
					inArray(schema.attachmentVersions.processingStatus, searchable)
				)
			);
		return rows.map((row) => ({
			kind: 'attached_to',
			from: { kind: 'attachment', id: row.attachmentId as AttachmentId, title: fileName(row.path) },
			to: { kind: 'note', id: row.noteId as NoteId, title: row.noteTitle }
		}));
	}
}
