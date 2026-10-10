import type { IEmbeddingBatching } from '$lib/server/services/knowledge-search/embedding-batching';
import { StaleRevisionError, ValidationError } from '$lib/errors';
import type { ToolResultReader } from '$lib/models/agent-tool-context';
import type {
	AgentToolInput,
	AgentWidgetCreationInput,
	AgentWidgetDataEditInput,
	AgentWidgetLayoutEditInput
} from '$lib/models/agent-tool-inputs';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { WidgetCatalogReader } from '$lib/models/widgets';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type {
	IndexCompletion,
	WidgetIndexing
} from '$lib/server/services/knowledge-search/indexing';
import type { ProjectLister } from '$lib/server/services/projects/catalog';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';
import type { AgentProjectChoiceRules } from '$lib/services/projects/agent-choice';
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
import type { IndexingResult } from '$lib/models/knowledge-search';
import type { ProjectId } from '$lib/models/projects';
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
import type { EmbeddingClient, EmbeddingBatch } from '$lib/models/knowledge-search/embeddings';
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

	agentReadWidgetCatalog(
		actor: ActorContext,
		input: AgentToolInput<'read_widget_catalog'>
	): Promise<AgentPayload>;
	agentCreateWidget(actor: ActorContext, input: AgentWidgetCreationInput): Promise<AgentPayload>;
	agentListWidgets(
		actor: ActorContext,
		input: AgentToolInput<'list_widgets'>
	): Promise<AgentPayload>;
	agentReadWidget(actor: ActorContext, input: AgentToolInput<'read_widget'>): Promise<AgentPayload>;
	agentEditWidgetData(actor: ActorContext, input: AgentWidgetDataEditInput): Promise<AgentPayload>;
	agentEditWidgetLayout(
		actor: ActorContext,
		input: AgentWidgetLayoutEditInput
	): Promise<AgentPayload>;
}

export interface WidgetsDependencies {
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolResults: ToolResultReader;
	readonly toolProjectChoice: AgentProjectChoiceRules;
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
	indexEmbeddings: EmbeddingClient;
	embeddingBatching: IEmbeddingBatching;
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
					const prepared = await this.dependencies.syncMutations.prepare(actor, input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					const command = input.command;
					switch (command.kind) {
						case 'createWidget':
							await this.create(actor, command);
							break;
						case 'editWidget':
							await this.write(actor, command.widgetId, (current) =>
								this.applyWidgetChange(current, command.change, widgetCatalog, now())
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
				this.createWidget(
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
				this.applyWidgetEdit(current, input.edit, widgetCatalog, now())
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
		const result: IndexingResult = await this.dependencies.widgetIndexer.indexWidget(
			actor,
			widget,
			this.dependencies.search.text(widget)
		);
		if (result.kind === 'stored') return;
		const batches: EmbeddingBatch[] = [];
		for (const contents of this.dependencies.embeddingBatching.batches(
			result.missing.map((chunk) => chunk.input)
		)) {
			batches.push(await this.dependencies.indexEmbeddings.embed(contents));
		}
		const batch = this.dependencies.embeddingBatching.combine(
			this.dependencies.indexEmbeddings.model,
			batches
		);
		await this.dependencies.indexWriter.complete(actor, result, batch);
	}

	async agentReadWidgetCatalog(
		actor: ActorContext,
		input: AgentToolInput<'read_widget_catalog'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.catalog(actor);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentCreateWidget(
		actor: ActorContext,
		input: AgentWidgetCreationInput
	): Promise<AgentPayload> {
		const result = await (async () => {
			const chosenProjectId =
				input.projectId ??
				(await this.dependencies.toolProjectChoice.requireChoice(
					await this.dependencies.projectLister.list(actor),
					'create a widget'
				));
			if (input.draft.kind === 'failure') throw input.draft.error;
			const { widget } = await this.create(actor, {
				id: crypto.randomUUID() as WidgetId,
				projectId: chosenProjectId,
				draft: input.draft.draft
			});
			// Single quotes parse the same as double ones, and need no escaping inside the JSON
			// arguments of the edit_note call that inserts the line. An unescaped double quote
			// there fails the whole run as malformed tool arguments.
			const embed = `:::widgetNode {widgetId='${widget.id}'} :::`;
			// Creating saves the widget in the project; only a reviewed note edit shows it in a
			// note (ADR 0003), so the result names that edit rather than performing it.
			return {
				widgetId: widget.id,
				title: widget.title,
				embed,
				nextActions: [
					input.noteId
						? {
								tool: 'edit_note' as const,
								noteId: input.noteId,
								reason: `The widget is not in the note yet. Call edit_note on note ${input.noteId} now and insert ${embed} on its own line where the user asked for it.`
							}
						: {
								tool: 'edit_note' as const,
								reason:
									'If the user asked for the widget in a note, insert the embed line on its own line in that note before you finish.'
							}
				]
			};
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentListWidgets(
		actor: ActorContext,
		input: AgentToolInput<'list_widgets'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			const chosenProjectId =
				input.projectId ??
				(await this.dependencies.toolProjectChoice.requireChoice(
					await this.dependencies.projectLister.list(actor),
					'list widgets'
				));
			const { widgets } = await this.list(actor, { projectId: chosenProjectId });
			return {
				widgets: widgets.map((widget) => ({
					widgetId: widget.id,
					title: widget.title,
					updatedAt: widget.updatedAt
				}))
			};
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentReadWidget(
		actor: ActorContext,
		input: AgentToolInput<'read_widget'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.get(actor, input);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentEditWidgetData(
		actor: ActorContext,
		input: AgentWidgetDataEditInput
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.edit(actor, {
				widgetId: input.widgetId,
				edit: {
					kind: 'data',
					expectedDataRevision: input.expectedDataRevision,
					patch: input.patch
				}
			});
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentEditWidgetLayout(
		actor: ActorContext,
		input: AgentWidgetLayoutEditInput
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.edit(actor, {
				widgetId: input.widgetId,
				edit: {
					kind: 'layout',
					expectedLayoutRevision: input.expectedLayoutRevision,
					patch: input.patch
				}
			});
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
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
