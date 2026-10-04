import { StaleRevisionError, ValidationError } from '$lib/errors';
import { mutationResource } from '$lib/services/workspace/commands';
import { applyWidgetChange, applyWidgetEdit, createWidget } from '$lib/services/widgets/edits';
import { decideWidgetTrash, widgetTrashChange } from '$lib/services/widgets/trash';
import {
	widgetCatalog,
	type CreateWidgetInput,
	type EditWidgetInput,
	type Widget,
	type WidgetEditResult,
	type WidgetId
} from '$lib/models/widgets';
import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { AtomicOperation as TransactionRunner, DateTime } from '$lib/models/workspace';
import type {
	WidgetMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { WorkspaceMutationReceipts } from '$lib/server/services/workspace/mutation-receipts';
import type {
	WidgetLister,
	WidgetReader,
	WidgetWriter
} from '$lib/server/services/widgets/contracts';

/**
 * Application boundary for widgets (ADR 0043). Every change, from the workspace queue or an
 * agent tool, is a `WidgetEdit` that `applyWidgetEdit` decides against the locked current
 * widget, so the browser's optimistic result and the saved result come from one rule.
 */
export interface WidgetsController {
	synchronize(actor: ActorContext, input: WidgetMutationRequest): Promise<WorkspaceMutationResult>;
	get(actor: ActorContext, input: { readonly widgetId: WidgetId }): Promise<{ widget: Widget }>;
	list(
		actor: ActorContext,
		input: { readonly projectId: ProjectId }
	): Promise<{ widgets: readonly Widget[] }>;
	/**
	 * @throws ValidationError if the draft uses a component or prop the catalog rejects.
	 */
	create(actor: ActorContext, input: CreateWidgetInput): Promise<{ widget: Widget }>;
	/**
	 * @throws StaleRevisionError if the edited part changed since the edit was made.
	 * @throws ValidationError if the patch does not apply or its result is not a valid widget.
	 */
	edit(actor: ActorContext, input: EditWidgetInput): Promise<{ widget: Widget }>;
	/** Move a widget to the trash. Notes that embed it show it as in the trash. */
	archive(actor: ActorContext, input: { readonly widgetId: WidgetId }): Promise<{ widget: Widget }>;
	restore(actor: ActorContext, input: { readonly widgetId: WidgetId }): Promise<{ widget: Widget }>;
	/** @throws ValidationError unless the widget is in the trash. */
	delete(actor: ActorContext, input: { readonly widgetId: WidgetId }): Promise<void>;
}

export interface WidgetsDependencies {
	syncMutations: Pick<WorkspaceMutationReceipts, 'prepare' | 'complete' | 'reject'>;
	syncRetry: 'database-only' | 'never';
	widgetReader: WidgetReader;
	widgetLister: WidgetLister;
	widgetWriter: WidgetWriter;
	transactionRunner: TransactionRunner;
}

const now = (): DateTime => new Date().toISOString() as DateTime;

/** The decided widget, or the domain failure the caller reports. */
const decided = (result: WidgetEditResult): Widget => {
	switch (result.kind) {
		case 'applied':
			return result.widget;
		case 'stale':
			throw new StaleRevisionError(
				`The widget ${result.part} is at revision ${result.currentRevision}. Read it again and retry.`
			);
		case 'invalid':
			throw new ValidationError(
				result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
			);
	}
};

export class Widgets implements WidgetsController {
	constructor(private readonly dependencies: WidgetsDependencies) {}

	async synchronize(
		actor: ActorContext,
		input: WidgetMutationRequest
	): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(actor, input, target);
					if (prepared.kind === 'finished') return prepared.result;
					const command = input.command;
					switch (command.kind) {
						case 'createWidget':
							await this.create(actor, command);
							break;
						case 'editWidget':
							await this.write(actor, command.widgetId, (current) =>
								applyWidgetChange(current, command.change, widgetCatalog, now())
							);
							break;
						case 'archiveWidget':
							await this.archive(actor, command);
							break;
						case 'restoreWidget':
							await this.restore(actor, command);
							break;
						case 'deleteWidget':
							await this.delete(actor, command);
							break;
					}
					return this.dependencies.syncMutations.complete(actor, input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	async get(
		actor: ActorContext,
		input: { readonly widgetId: WidgetId }
	): Promise<{ widget: Widget }> {
		return { widget: await this.dependencies.widgetReader.get(actor, input.widgetId) };
	}

	async list(
		actor: ActorContext,
		input: { readonly projectId: ProjectId }
	): Promise<{ widgets: readonly Widget[] }> {
		return { widgets: await this.dependencies.widgetLister.listForProject(actor, input.projectId) };
	}

	async create(actor: ActorContext, input: CreateWidgetInput): Promise<{ widget: Widget }> {
		return this.dependencies.transactionRunner.run(async () => {
			const widget = decided(
				createWidget(
					input.draft,
					{
						id: input.id,
						userId: actor.userId,
						projectId: input.projectId,
						...(input.sourceNoteId ? { sourceNoteId: input.sourceNoteId } : {}),
						now: now()
					},
					widgetCatalog
				)
			);
			return { widget: await this.dependencies.widgetWriter.create(actor, widget) };
		});
	}

	async edit(actor: ActorContext, input: EditWidgetInput): Promise<{ widget: Widget }> {
		return {
			widget: await this.write(actor, input.widgetId, (current) =>
				applyWidgetEdit(current, input.edit, widgetCatalog, now())
			)
		};
	}

	async archive(
		actor: ActorContext,
		input: { readonly widgetId: WidgetId }
	): Promise<{ widget: Widget }> {
		return { widget: await this.moveTrash(actor, input.widgetId, 'archive') };
	}

	async restore(
		actor: ActorContext,
		input: { readonly widgetId: WidgetId }
	): Promise<{ widget: Widget }> {
		return { widget: await this.moveTrash(actor, input.widgetId, 'restore') };
	}

	async delete(actor: ActorContext, input: { readonly widgetId: WidgetId }): Promise<void> {
		await this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.widgetWriter.getForEdit(actor, input.widgetId);
			const decision = decideWidgetTrash('delete', current);
			if (decision.kind === 'invalid') throw new ValidationError(decision.message);
			await this.dependencies.widgetWriter.deleteArchived(actor, input.widgetId);
		});
	}

	private async moveTrash(
		actor: ActorContext,
		widgetId: WidgetId,
		action: 'archive' | 'restore'
	): Promise<Widget> {
		return this.write(actor, widgetId, (current) => {
			const change = widgetTrashChange(action, current, now());
			return change.kind === 'change'
				? { kind: 'applied', widget: change.widget }
				: { kind: 'invalid', issues: [{ path: '/archivedAt', message: change.message }] };
		});
	}

	/** Decide a change against the locked current widget and save it from that revision. */
	private async write(
		actor: ActorContext,
		widgetId: WidgetId,
		decide: (current: Widget) => WidgetEditResult
	): Promise<Widget> {
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.widgetWriter.getForEdit(actor, widgetId);
			return this.dependencies.widgetWriter.update(actor, decided(decide(current)), {
				layoutRevision: current.layoutRevision,
				dataRevision: current.dataRevision
			});
		});
	}
}
