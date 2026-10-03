import { StaleRevisionError, ValidationError } from '$lib/errors';
import { mutationResource } from '$lib/services/workspace/commands';
import { applyWidgetEdit, createWidget } from '$lib/services/widgets/edits';
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
							await this.edit(actor, command);
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
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.widgetWriter.getForEdit(actor, input.widgetId);
			const widget = decided(applyWidgetEdit(current, input.edit, widgetCatalog, now()));
			return {
				widget: await this.dependencies.widgetWriter.update(actor, widget, {
					layoutRevision: current.layoutRevision,
					dataRevision: current.dataRevision
				})
			};
		});
	}
}
