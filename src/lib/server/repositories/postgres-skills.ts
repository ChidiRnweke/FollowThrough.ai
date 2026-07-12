import { and, asc, eq, isNull } from 'drizzle-orm';
import type { ActorContext, NoteId, Skill, SkillSummary, SkillUsage } from '$lib/models';
import { NotFoundError } from '$lib/models';
import type { SkillRepository } from '$lib/repositories/skills';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { toSkill } from '../domain/mappers';

export class PostgresSkillRepository implements SkillRepository {
	constructor(private readonly database: Database) {}
	async findByNoteId(actor: ActorContext, noteId: NoteId): Promise<Skill | undefined> {
		const [row] = await this.database
			.select({ note: schema.notes, skill: schema.skills })
			.from(schema.skills)
			.innerJoin(schema.notes, eq(schema.notes.id, schema.skills.noteId))
			.innerJoin(schema.projects, eq(schema.projects.id, schema.notes.projectId))
			.where(
				and(
					eq(schema.notes.id, noteId),
					eq(schema.notes.userId, actor.userId),
					isNull(schema.projects.archivedAt)
				)
			);
		return row ? toSkill(row.note, row.skill) : undefined;
	}
	async listEnabled(actor: ActorContext): Promise<readonly SkillSummary[]> {
		return (
			await this.database
				.select({ note: schema.notes, skill: schema.skills })
				.from(schema.skills)
				.innerJoin(schema.notes, eq(schema.notes.id, schema.skills.noteId))
				.innerJoin(schema.projects, eq(schema.projects.id, schema.notes.projectId))
				.where(
					and(
						eq(schema.notes.userId, actor.userId),
						eq(schema.skills.isEnabled, true),
						isNull(schema.projects.archivedAt)
					)
				)
				.orderBy(asc(schema.skills.name))
		).map(({ note, skill }) => ({
			noteId: note.id as NoteId,
			name: skill.name,
			description: skill.description,
			triggerHints: skill.triggerHints,
			isEnabled: skill.isEnabled
		}));
	}
	async insert(actor: ActorContext, skill: Skill): Promise<Skill> {
		return this.persist(actor, skill);
	}
	async update(actor: ActorContext, skill: Skill): Promise<Skill> {
		return this.persist(actor, skill);
	}
	private async persist(actor: ActorContext, skill: Skill): Promise<Skill> {
		const [note] = await this.database
			.select()
			.from(schema.notes)
			.where(and(eq(schema.notes.id, skill.note.id), eq(schema.notes.userId, actor.userId)));
		if (!note) throw new NotFoundError('Skill note was not found');
		const [row] = await this.database
			.insert(schema.skills)
			.values({
				noteId: skill.note.id,
				name: skill.name,
				description: skill.description,
				triggerHints: [...skill.triggerHints],
				isEnabled: skill.isEnabled
			})
			.onConflictDoUpdate({
				target: schema.skills.noteId,
				set: {
					name: skill.name,
					description: skill.description,
					triggerHints: [...skill.triggerHints],
					isEnabled: skill.isEnabled
				}
			})
			.returning();
		return toSkill(note, row!);
	}
	async recordUsage(actor: ActorContext, usage: SkillUsage): Promise<SkillUsage> {
		if (!(await this.findByNoteId(actor, usage.skillNoteId)))
			throw new NotFoundError('Skill was not found');
		const [row] = await this.database
			.insert(schema.skillUsages)
			.values({
				id: usage.id,
				skillNoteId: usage.skillNoteId,
				contextNoteId: usage.contextNoteId,
				provenanceId: usage.provenanceId,
				createdAt: new Date(usage.createdAt)
			})
			.returning();
		return {
			id: row!.id as SkillUsage['id'],
			skillNoteId: row!.skillNoteId as NoteId,
			...(row!.contextNoteId ? { contextNoteId: row!.contextNoteId as NoteId } : {}),
			...(row!.provenanceId
				? { provenanceId: row!.provenanceId as SkillUsage['provenanceId'] }
				: {}),
			createdAt: row!.createdAt.toISOString() as SkillUsage['createdAt']
		};
	}
	async listUsages(actor: ActorContext, noteId: NoteId): Promise<readonly SkillUsage[]> {
		if (!(await this.findByNoteId(actor, noteId))) throw new NotFoundError('Skill was not found');
		return (
			await this.database
				.select()
				.from(schema.skillUsages)
				.where(eq(schema.skillUsages.skillNoteId, noteId))
				.orderBy(asc(schema.skillUsages.createdAt))
		).map((row) => ({
			id: row.id as SkillUsage['id'],
			skillNoteId: row.skillNoteId as NoteId,
			...(row.contextNoteId ? { contextNoteId: row.contextNoteId as NoteId } : {}),
			...(row.provenanceId ? { provenanceId: row.provenanceId as SkillUsage['provenanceId'] } : {}),
			createdAt: row.createdAt.toISOString() as SkillUsage['createdAt']
		}));
	}
}
