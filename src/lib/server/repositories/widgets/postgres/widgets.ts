import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { ActorContext, UserId } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime } from '$lib/models/workspace';
import {
	widgetDataSchema,
	widgetLayoutSchema,
	type Widget,
	type WidgetId
} from '$lib/models/widgets';
import { ConflictError, NotFoundError } from '$lib/errors';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/widgets';
import type { WidgetRepository, WidgetRevisions } from '$lib/server/repositories/widgets';

const instant = (value: Date): DateTime => value.toISOString() as DateTime;

/** Layout and data are JSON columns, so they are parsed here, where they leave the database. */
const toWidget = (row: typeof schema.widgets.$inferSelect): Widget => ({
	id: row.id as WidgetId,
	userId: row.userId as UserId,
	projectId: row.projectId as ProjectId,
	...(row.sourceNoteId ? { sourceNoteId: row.sourceNoteId as NoteId } : {}),
	title: row.title,
	catalogVersion: row.catalogVersion,
	layout: widgetLayoutSchema.parse(row.layout),
	layoutRevision: row.layoutRevision,
	data: widgetDataSchema.parse(row.data),
	dataRevision: row.dataRevision,
	...(row.archivedAt ? { archivedAt: instant(row.archivedAt) } : {}),
	createdAt: instant(row.createdAt),
	updatedAt: instant(row.updatedAt)
});

export class WidgetRecords implements WidgetRepository {
	constructor(private readonly database: Database) {}

	private owned(actor: ActorContext, id: WidgetId) {
		return and(eq(schema.widgets.id, id), eq(schema.widgets.userId, actor.userId));
	}

	async findById(actor: ActorContext, id: WidgetId): Promise<Widget | undefined> {
		const [row] = await this.database.select().from(schema.widgets).where(this.owned(actor, id));
		return row ? toWidget(row) : undefined;
	}

	async findByIdForUpdate(actor: ActorContext, id: WidgetId): Promise<Widget | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.widgets)
			.where(this.owned(actor, id))
			.for('update');
		return row ? toWidget(row) : undefined;
	}

	async listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly Widget[]> {
		return (
			await this.database
				.select()
				.from(schema.widgets)
				.where(
					and(
						eq(schema.widgets.userId, actor.userId),
						eq(schema.widgets.projectId, projectId),
						isNull(schema.widgets.archivedAt)
					)
				)
				.orderBy(desc(schema.widgets.updatedAt))
		).map(toWidget);
	}

	async insert(actor: ActorContext, widget: Widget): Promise<Widget> {
		const [row] = await this.database
			.insert(schema.widgets)
			.values({
				id: widget.id,
				userId: actor.userId,
				projectId: widget.projectId,
				sourceNoteId: widget.sourceNoteId,
				title: widget.title,
				catalogVersion: widget.catalogVersion,
				layout: widget.layout,
				layoutRevision: widget.layoutRevision,
				data: widget.data,
				dataRevision: widget.dataRevision,
				createdAt: new Date(widget.createdAt),
				updatedAt: new Date(widget.updatedAt)
			})
			.returning();
		return toWidget(row!);
	}

	async update(actor: ActorContext, widget: Widget, from: WidgetRevisions): Promise<Widget> {
		const [row] = await this.database
			.update(schema.widgets)
			.set({
				title: widget.title,
				catalogVersion: widget.catalogVersion,
				layout: widget.layout,
				layoutRevision: widget.layoutRevision,
				data: widget.data,
				dataRevision: widget.dataRevision,
				archivedAt: widget.archivedAt ? new Date(widget.archivedAt) : null,
				updatedAt: new Date(widget.updatedAt)
			})
			.where(
				and(
					this.owned(actor, widget.id),
					eq(schema.widgets.layoutRevision, from.layoutRevision),
					eq(schema.widgets.dataRevision, from.dataRevision)
				)
			)
			.returning();
		if (!row) throw new ConflictError('The widget changed while it was being saved');
		return toWidget(row);
	}

	async deleteArchived(actor: ActorContext, id: WidgetId): Promise<void> {
		const deleted = await this.database
			.delete(schema.widgets)
			.where(and(this.owned(actor, id), isNotNull(schema.widgets.archivedAt)))
			.returning({ id: schema.widgets.id });
		if (deleted.length === 0)
			throw new NotFoundError('Widget was not found in the trash', { widgetId: id });
	}
}
