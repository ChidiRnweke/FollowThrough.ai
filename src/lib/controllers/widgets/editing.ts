import type { DateTime } from '$lib/models/workspace';
import { widgetCatalog } from '$lib/models/widgets';
import type {
	WidgetEditorReader,
	WidgetEditorPreview,
	Widget,
	WidgetChange,
	WidgetEdit,
	WidgetCatalog,
	WidgetDraft,
	WidgetCreation,
	WidgetEditResult,
	WidgetCandidateReader,
	WidgetCandidate,
	WidgetContent
} from '$lib/models/widgets';
import type { IWidgetEditingService } from '$lib/services/widgets/edits';
import type { IWidgetPatchService } from '$lib/services/widgets/patches';

export interface WidgetEditingController {
	validate(candidate: WidgetCandidate, catalog: WidgetCatalog): WidgetEditResult;
	previewText(
		widget: Widget,
		title: string,
		layoutText: string,
		dataText: string,
		now: DateTime
	): WidgetEditorPreview;
	createWidget(
		draft: WidgetDraft,
		creation: WidgetCreation,
		catalog: WidgetCatalog
	): WidgetEditResult;
	applyWidgetChange(
		widget: Widget,
		change: WidgetChange,
		catalog: WidgetCatalog,
		now: DateTime
	): WidgetEditResult;
	applyWidgetEdit(
		widget: Widget,
		edit: WidgetEdit,
		catalog: WidgetCatalog,
		now: DateTime
	): WidgetEditResult;
	applyWidgetChanges(
		widget: Widget,
		changes: readonly WidgetChange[],
		catalog: WidgetCatalog,
		now: DateTime
	): WidgetEditResult;
	preview(
		widget: Widget,
		next: WidgetContent,
		catalog: WidgetCatalog,
		now: DateTime
	): { readonly changes: readonly WidgetChange[]; readonly result: WidgetEditResult };
}

/** One synchronous write operation shared by previews, offline commands and server writes. */
export class WidgetEdits implements WidgetEditingController {
	constructor(
		private readonly patches: IWidgetPatchService,
		private readonly reader: WidgetCandidateReader,
		private readonly editing: IWidgetEditingService,
		private readonly editorReader: WidgetEditorReader
	) {}

	validate(candidate: WidgetCandidate, catalog: WidgetCatalog): WidgetEditResult {
		const read = this.reader.read(candidate, catalog);
		return read.kind === 'invalid' ? read : this.editing.decide(read.widget, read.issues);
	}

	createWidget(
		draft: WidgetDraft,
		creation: WidgetCreation,
		catalog: WidgetCatalog
	): WidgetEditResult {
		const widget = this.editing.create(draft, creation, catalog.version);
		return this.validate(widget, catalog);
	}

	applyWidgetChange(
		widget: Widget,
		change: WidgetChange,
		catalog: WidgetCatalog,
		now: DateTime
	): WidgetEditResult {
		if (change.kind === 'parts') {
			const data = this.patches.propose(
				widget,
				{ kind: 'data', patch: change.data },
				catalog.version,
				now
			);
			if (data.kind === 'invalid') return data;
			const read = this.reader.read(data.widget, catalog);
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
		const proposal = this.patches.propose(widget, change, catalog.version, now);
		if (proposal.kind === 'invalid') return proposal;
		// Renaming has never revalidated an unchanged stored layout or data.
		if (proposal.change === 'rename') return { kind: 'applied', widget: proposal.widget };
		return this.validate(proposal.widget, catalog);
	}

	applyWidgetEdit(
		widget: Widget,
		edit: WidgetEdit,
		catalog: WidgetCatalog,
		now: DateTime
	): WidgetEditResult {
		const stale = this.editing.revision(widget, edit);
		return stale ?? this.applyWidgetChange(widget, edit, catalog, now);
	}

	applyWidgetChanges(
		widget: Widget,
		changes: readonly WidgetChange[],
		catalog: WidgetCatalog,
		now: DateTime
	): WidgetEditResult {
		let result: WidgetEditResult = { kind: 'applied', widget };
		for (const change of changes) {
			if (result.kind !== 'applied') return result;
			result = this.applyWidgetChange(result.widget, change, catalog, now);
		}
		return result;
	}

	preview(
		widget: Widget,
		next: WidgetContent,
		catalog: WidgetCatalog,
		now: DateTime
	): { readonly changes: readonly WidgetChange[]; readonly result: WidgetEditResult } {
		const changes = this.patches.changesBetween(widget, next);
		return { changes, result: this.applyWidgetChanges(widget, changes, catalog, now) };
	}
	previewText(
		widget: Widget,
		title: string,
		layoutText: string,
		dataText: string,
		now: DateTime
	): WidgetEditorPreview {
		const read = this.editorReader.read(title, layoutText, dataText);
		if (read.kind === 'invalid') return read;
		const { changes, result } = this.preview(widget, read.content, widgetCatalog, now);
		if (result.kind === 'applied') return { kind: 'ready', changes, preview: result.widget };
		return {
			kind: 'invalid',
			issues:
				result.kind === 'invalid'
					? result.issues
					: [{ path: `/${result.part}`, message: 'The widget changed. Reopen the editor.' }]
		};
	}
}
