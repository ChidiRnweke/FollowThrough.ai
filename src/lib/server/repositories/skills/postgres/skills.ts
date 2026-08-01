import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { Skill, SkillSummary, SkillUsage } from '$lib/models/skills';
import { NotFoundError } from '$lib/errors';
import type { SkillRepository } from '$lib/server/repositories/skills/skills';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/skills';
import { toSkill } from '$lib/server/db/mappers';

export class SkillRecords implements SkillRepository {
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
	async listEnabled(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		return (await this.listAll(actor, projectId)).filter((skill) => skill.isEnabled);
	}
	async listAll(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		return (
			await this.database
				.select({
					note: schema.notes,
					skill: schema.skills,
					pin: schema.projectSkillPins.projectId
				})
				.from(schema.skills)
				.innerJoin(schema.notes, eq(schema.notes.id, schema.skills.noteId))
				.innerJoin(schema.projects, eq(schema.projects.id, schema.notes.projectId))
				.leftJoin(
					schema.projectSkillPins,
					projectId
						? and(
								eq(schema.projectSkillPins.skillNoteId, schema.skills.noteId),
								eq(schema.projectSkillPins.projectId, projectId)
							)
						: sql<boolean>`false`
				)
				.where(and(eq(schema.notes.userId, actor.userId), isNull(schema.projects.archivedAt)))
				.orderBy(asc(schema.skills.name))
		).map(({ note, skill, pin }) => ({
			noteId: note.id as NoteId,
			projectId: note.projectId as SkillSummary['projectId'],
			name: skill.name,
			slug: skill.slug,
			description: skill.description,
			triggerHints: skill.triggerHints,
			allowImplicitInvocation: skill.allowImplicitInvocation,
			isPinned: Boolean(pin),
			isEnabled: skill.isEnabled
		}));
	}

	async setPinned(
		actor: ActorContext,
		noteId: NoteId,
		projectId: ProjectId,
		pinned: boolean
	): Promise<void> {
		if (!(await this.findByNoteId(actor, noteId))) throw new NotFoundError('Skill was not found');
		const [project] = await this.database
			.select({ id: schema.projects.id })
			.from(schema.projects)
			.where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, actor.userId)));
		if (!project) throw new NotFoundError('Project was not found');
		if (pinned) {
			await this.database
				.insert(schema.projectSkillPins)
				.values({ projectId, skillNoteId: noteId })
				.onConflictDoNothing();
			return;
		}
		await this.database
			.delete(schema.projectSkillPins)
			.where(
				and(
					eq(schema.projectSkillPins.projectId, projectId),
					eq(schema.projectSkillPins.skillNoteId, noteId)
				)
			);
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
				slug: skill.slug ?? skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
				description: skill.description,
				triggerHints: [...skill.triggerHints],
				license: skill.license,
				compatibility: skill.compatibility,
				metadata: { ...(skill.metadata ?? {}) },
				allowImplicitInvocation: skill.allowImplicitInvocation ?? true,
				isEnabled: skill.isEnabled
			})
			.onConflictDoUpdate({
				target: schema.skills.noteId,
				set: {
					name: skill.name,
					slug: skill.slug ?? skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
					description: skill.description,
					triggerHints: [...skill.triggerHints],
					license: skill.license,
					compatibility: skill.compatibility,
					metadata: { ...(skill.metadata ?? {}) },
					allowImplicitInvocation: skill.allowImplicitInvocation ?? true,
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
