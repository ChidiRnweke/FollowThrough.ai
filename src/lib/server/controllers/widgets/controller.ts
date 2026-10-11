import { StaleRevisionError, ValidationError } from '$lib/errors';
import type { WidgetCatalogReader } from '$lib/models/widgets';
import type { WidgetIndexing } from '$lib/server/services/knowledge-search/retrieval';
import type { ProjectLister } from '$lib/server/services/projects/catalog';
import type { ProjectChoiceRules } from '$lib/services/projects/rules';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

import type {
	WidgetCandidate,
	WidgetCandidateReader,
	WidgetCatalog,
	WidgetChange,
	WidgetCreation,
	WidgetDraft,
	WidgetEdit
} from '$lib/models/widgets';
import type { IWidgetCatalogService } from '$lib/services/widgets/catalog-prompt';
import type { IWidgetEditingService } from '$lib/services/widgets/edits';
import type { IWidgetPatchService } from '$lib/services/widgets/patches';
import type { IWidgetSearchService } from '$lib/services/widgets/search-text';
import type { IWidgetLifecycleService } from '$lib/services/widgets/trash';

import type { ActorContext } from '$lib/models/identity';
import type { ProjectId, WithProjectChoice } from '$lib/models/projects';
import {
	widgetCatalog,
	type CreateWidgetInput,
	type EditWidgetInput,
	type Widget,
	type WidgetEditResult,
	type WidgetId
} from '$lib/models/widgets';
import type { DateTime, AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type {
	WidgetMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type {
	WidgetLister,
	WidgetReader,
	WidgetWriter
} from '$lib/server/services/widgets/library';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';

/**
 * Application boundary for widgets (ADR 0043). Every change, from the workspace queue or an
 * agent tool, is a `WidgetEdit` that `applyWidgetEdit` decides against the locked current
 * widget, so the browser's optimistic result and the saved result come from one rule.
 */
export interface WidgetsController {
	synchronize(input: WidgetMutationRequest): Promise<WorkspaceMutationResult>;
	get(input: { readonly widgetId: WidgetId }): Promise<{ widget: Widget }>;
	/** The catalog a layout must fit, written for an agent that is about to write one. */
	catalog(): Promise<{ catalogVersion: number; reference: string }>;
	/** @throws ProjectChoiceRequiredError if the request names no project. */
	list(input: { readonly projectId?: ProjectId }): Promise<{ widgets: readonly Widget[] }>;
	/**
	 * @throws ValidationError if the draft uses a component or prop the catalog rejects.
	 * @throws ProjectChoiceRequiredError if the request names no project.
	 */
	create(input: WithProjectChoice<CreateWidgetInput>): Promise<{ widget: Widget }>;
	/**
	 * @throws StaleRevisionError if the edited part changed since the edit was made.
	 * @throws ValidationError if the patch does not apply or its result is not a valid widget.
	 */
	edit(input: EditWidgetInput): Promise<{ widget: Widget }>;
	/** Move a widget to the trash. Notes that embed it show it as in the trash. */
	archive(input: { readonly widgetId: WidgetId }): Promise<{ widget: Widget }>;
	restore(input: { readonly widgetId: WidgetId }): Promise<{ widget: Widget }>;
	/** @throws ValidationError unless the widget is in the trash. */
	delete(input: { readonly widgetId: WidgetId }): Promise<void>;
}

export interface WidgetsDependencies {
	/** The process clock, shared by every capability that stamps time. */
	readonly now: () => DateTime;
	readonly projectChoice: ProjectChoiceRules;
	readonly projectLister: ProjectLister;

	catalogReader: WidgetCatalogReader;
	widgetEditingRules: IWidgetEditingService;
	widgetPatches: IWidgetPatchService;
	widgetCandidateReader: WidgetCandidateReader;
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
	transactionRunner: TransactionRunner;
}

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
		private readonly actor: ActorContext,
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: WidgetsDependencies
	) {}

	async synchronize(input: WidgetMutationRequest): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					const command = input.command;
					switch (command.kind) {
						case 'createWidget':
							await this.create(command);
							break;
						case 'editWidget':
							await this.write(command.widgetId, (current) =>
								this.applyWidgetChange(
									current,
									command.change,
									widgetCatalog,
									this.dependencies.now()
								)
							);
							break;
						case 'archiveWidget':
							await this.archive(command);
							break;
						case 'restoreWidget':
							await this.restore(command);
							break;
						case 'deleteWidget':
							await this.delete(command);
							break;
					}
					return this.dependencies.syncMutations.complete(input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	async get(input: { readonly widgetId: WidgetId }): Promise<{ widget: Widget }> {
		return { widget: await this.dependencies.widgetReader.get(input.widgetId) };
	}

	async catalog(): Promise<{ catalogVersion: number; reference: string }> {
		return {
			catalogVersion: widgetCatalog.version,
			reference: this.dependencies.catalog.describe(
				this.dependencies.catalogReader.readCatalog(widgetCatalog)
			)
		};
	}

	async list(input: { readonly projectId?: ProjectId }): Promise<{ widgets: readonly Widget[] }> {
		const projectId =
			input.projectId ??
			this.dependencies.projectChoice.requireChoice(
				await this.dependencies.projectLister.list(),
				'list widgets'
			);
		return { widgets: await this.dependencies.widgetLister.listForProject(projectId) };
	}

	async create(input: WithProjectChoice<CreateWidgetInput>): Promise<{ widget: Widget }> {
		const projectId =
			input.projectId ??
			this.dependencies.projectChoice.requireChoice(
				await this.dependencies.projectLister.list(),
				'create a widget'
			);
		return this.dependencies.transactionRunner.run(async () => {
			const widget = decided(
				this.createWidget(
					input.draft,
					{
						id: input.id,
						userId: this.actor.userId,
						projectId,
						...(input.sourceNoteId ? { sourceNoteId: input.sourceNoteId } : {}),
						now: this.dependencies.now()
					},
					widgetCatalog
				)
			);
			const created = await this.dependencies.widgetWriter.create(widget);
			await this.index(created);
			return { widget: created };
		});
	}

	async edit(input: EditWidgetInput): Promise<{ widget: Widget }> {
		return {
			widget: await this.write(input.widgetId, (current) =>
				this.applyWidgetEdit(current, input.edit, widgetCatalog, this.dependencies.now())
			)
		};
	}

	async archive(input: { readonly widgetId: WidgetId }): Promise<{ widget: Widget }> {
		return { widget: await this.moveTrash(input.widgetId, 'archive') };
	}

	async restore(input: { readonly widgetId: WidgetId }): Promise<{ widget: Widget }> {
		return { widget: await this.moveTrash(input.widgetId, 'restore') };
	}

	async delete(input: { readonly widgetId: WidgetId }): Promise<void> {
		await this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.widgetWriter.getForEdit(input.widgetId);
			const decision = this.dependencies.lifecycle.decide('delete', current);
			if (decision.kind === 'invalid') throw new ValidationError(decision.message);
			await this.dependencies.widgetWriter.deleteArchived(input.widgetId);
		});
	}

	private async moveTrash(widgetId: WidgetId, action: 'archive' | 'restore'): Promise<Widget> {
		return this.write(widgetId, (current) => {
			const change = this.dependencies.lifecycle.change(action, current, this.dependencies.now());
			return change.kind === 'change'
				? { kind: 'applied', widget: change.widget }
				: { kind: 'invalid', issues: [{ path: '/archivedAt', message: change.message }] };
		});
	}

	/** Decide a change against the locked current widget and save it from that revision. */
	private async write(
		widgetId: WidgetId,
		decide: (current: Widget) => WidgetEditResult
	): Promise<Widget> {
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.widgetWriter.getForEdit(widgetId);
			const saved = await this.dependencies.widgetWriter.update(decided(decide(current)), {
				layoutRevision: current.layoutRevision,
				dataRevision: current.dataRevision
			});
			await this.index(saved);
			return saved;
		});
	}

	/** Index what the widget now shows. */
	private index(widget: Widget): Promise<void> {
		return this.dependencies.widgetIndexer.indexWidget(
			widget,
			this.dependencies.search.text(widget)
		);
	}

	private validate(candidate: WidgetCandidate, catalog: WidgetCatalog): WidgetEditResult {
		const read = this.dependencies.widgetCandidateReader.read(candidate, catalog);
		return read.kind === 'invalid'
			? read
			: this.dependencies.widgetEditingRules.decide(read.widget, read.issues);
	}

	private createWidget(
		draft: WidgetDraft,
		creation: WidgetCreation,
		catalog: WidgetCatalog
	): WidgetEditResult {
		const widget = this.dependencies.widgetEditingRules.create(draft, creation, catalog.version);
		return this.validate(widget, catalog);
	}

	private applyWidgetChange(
		widget: Widget,
		change: WidgetChange,
		catalog: WidgetCatalog,
		now: DateTime
	): WidgetEditResult {
		if (change.kind === 'parts') {
			const data = this.dependencies.widgetPatches.propose(
				widget,
				{ kind: 'data', patch: change.data },
				catalog.version,
				now
			);
			if (data.kind === 'invalid') return data;
			const read = this.dependencies.widgetCandidateReader.read(data.widget, catalog);
			if (read.kind === 'invalid') return read;
			// Preserve data-shape failure precedence. Semantic and catalog issues belong
			// to the completed pair: the new layout may repair an intermediate issue.
			return this.applyWidgetChange(
				read.widget,
				{ kind: 'layout', patch: change.layout },
				catalog,
				now
			);
		}
		const proposal = this.dependencies.widgetPatches.propose(widget, change, catalog.version, now);
		if (proposal.kind === 'invalid') return proposal;
		// Renaming has never revalidated an unchanged stored layout or data.
		if (proposal.change === 'rename') return { kind: 'applied', widget: proposal.widget };
		return this.validate(proposal.widget, catalog);
	}

	private applyWidgetEdit(
		widget: Widget,
		edit: WidgetEdit,
		catalog: WidgetCatalog,
		now: DateTime
	): WidgetEditResult {
		const stale = this.dependencies.widgetEditingRules.revision(widget, edit);
		return stale ?? this.applyWidgetChange(widget, edit, catalog, now);
	}
}
