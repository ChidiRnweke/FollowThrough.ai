import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';
import type {
	IndexCompletion,
	WidgetIndexing
} from '$lib/server/services/knowledge-search/indexing';
import type { WidgetCatalogReader } from '$lib/models/widgets';
import { StaleRevisionError, ValidationError } from '$lib/errors';

import type { WidgetEditingController } from '$lib/controllers/widgets/editing';
import type { IWidgetLifecycleService } from '$lib/services/widgets/trash';
import type { IWidgetCatalogService } from '$lib/services/widgets/catalog-prompt';
import type { IWidgetSearchService } from '$lib/services/widgets/search-text';

import type { IndexingResult } from '$lib/models/knowledge-search';
import type { IEmbeddings } from '$lib/server/services/knowledge-search/embeddings';
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
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';
import type {
	WidgetLister,
	WidgetReader,
	WidgetWriter
} from '$lib/server/services/widgets/library';

/**
 * Application boundary for widgets (ADR 0043). Every change, from the workspace queue or an
 * agent tool, is a `WidgetEdit` that `applyWidgetEdit` decides against the locked current
 * widget, so the browser's optimistic result and the saved result come from one rule.
 */
export interface WidgetsController {
	synchronize(actor: ActorContext, input: WidgetMutationRequest): Promise<WorkspaceMutationResult>;
	get(actor: ActorContext, input: { readonly widgetId: WidgetId }): Promise<{ widget: Widget }>;
	/** The catalog a layout must fit, written for an agent that is about to write one. */
	catalog(actor: ActorContext): Promise<{ catalogVersion: number; reference: string }>;
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
	catalogReader: WidgetCatalogReader;
	editing: WidgetEditingController;
	lifecycle: IWidgetLifecycleService;
	catalog: IWidgetCatalogService;
	search: IWidgetSearchService;
	syncMutations: WorkspaceMutationGuard;
	syncRetry: 'database-only' | 'never';
	widgetReader: WidgetReader;
	widgetLister: WidgetLister;
	widgetWriter: WidgetWriter;
	/** Keeps the knowledge index in step with what each widget shows (ADR 0019). */
	widgetIndexer: WidgetIndexing;
	indexEmbeddings: IEmbeddings;
	indexWriter: IndexCompletion;
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
	constructor(
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: WidgetsDependencies
	) {}

	async synchronize(
		actor: ActorContext,
		input: WidgetMutationRequest
	): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(actor, input, target);
					if (prepared.kind === 'finished') return prepared.result;
					const command = input.command;
					switch (command.kind) {
						case 'createWidget':
							await this.create(actor, command);
							break;
						case 'editWidget':
							await this.write(actor, command.widgetId, (current) =>
								this.dependencies.editing.applyWidgetChange(
									current,
									command.change,
									widgetCatalog,
									now()
								)
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

	async catalog(actor: ActorContext): Promise<{ catalogVersion: number; reference: string }> {
		void actor;
		return {
			catalogVersion: widgetCatalog.version,
			reference: this.dependencies.catalog.describe(
				this.dependencies.catalogReader.readCatalog(widgetCatalog)
			)
		};
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
				this.dependencies.editing.createWidget(
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
			const created = await this.dependencies.widgetWriter.create(actor, widget);
			await this.index(actor, created);
			return { widget: created };
		});
	}

	async edit(actor: ActorContext, input: EditWidgetInput): Promise<{ widget: Widget }> {
		return {
			widget: await this.write(actor, input.widgetId, (current) =>
				this.dependencies.editing.applyWidgetEdit(current, input.edit, widgetCatalog, now())
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
			const decision = this.dependencies.lifecycle.decide('delete', current);
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
			const change = this.dependencies.lifecycle.change(action, current, now());
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
			const saved = await this.dependencies.widgetWriter.update(actor, decided(decide(current)), {
				layoutRevision: current.layoutRevision,
				dataRevision: current.dataRevision
			});
			await this.index(actor, saved);
			return saved;
		});
	}

	/** Index what the widget now shows; embed inline unless the index defers to the worker. */
	private async index(actor: ActorContext, widget: Widget): Promise<void> {
		const result: IndexingResult = await this.dependencies.widgetIndexer.index(
			actor,
			widget,
			this.dependencies.search.text(widget)
		);
		if (result.kind === 'stored') return;
		const batch = await this.dependencies.indexEmbeddings.embed(
			result.missing.map((chunk) => chunk.input)
		);
		await this.dependencies.indexWriter.complete(actor, result, batch);
	}
}
