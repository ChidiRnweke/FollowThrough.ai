import type { EntityRef } from '$lib/models/tool-display';
export type { EntityKind, EntityRef } from '$lib/models/tool-display';
import { toolPresentationKind, type ToolFamily } from './tool-catalog-presentation';
import type { ShellContext } from '$lib/models/workspace';
import { toolFailure, toolOutput, type ChatToolActivity } from '$lib/stores/agent/chat-tools';
import { argumentLabel, isIdentifierArgument } from '../../chat/actions/tool-approval-fields';
import { explainToolFailure } from './tool-result';
import { entityFrom, toolEntity, fileEntity } from './tool-entities';
import { toolCollection } from './tool-collections';
import {
	agentPayloadItems,
	isAgentPayloadObject,
	type AgentPayload
} from '$lib/models/agent/payload';

/** The result detail for a call. Targets and concise outcomes render before any expansion. */

export interface FieldChange {
	readonly label: string;
	/** Absent when no before-image is available; the row then states the value it was set to. */
	readonly from?: string;
	readonly to: string;
}

/** One line of what a look inside the virtual files came back with. */
export interface FileOutputLine {
	readonly text: string;
	/** Where the line sits — a line number or the note it matched in — when known. */
	readonly context?: string;
	readonly source?: EntityRef;
	readonly lineNumber?: number;
}

export type ToolDisclosure =
	/** Mechanism. Never rendered at all, so it never reaches a row. */
	| { readonly kind: 'none' }
	/** One thing, read. The row opens it; there is nothing to unfold. */
	| { readonly kind: 'link'; readonly entity: EntityRef }
	/** Many things, read. What came back, as rows of their own kind. */
	| { readonly kind: 'collection'; readonly entities: readonly EntityRef[]; readonly total: number }
	/** A look inside the virtual files — a grep, a sed excerpt, an ls — with what came back. */
	| {
			readonly kind: 'file-output';
			readonly headline: string;
			readonly lines: readonly FileOutputLine[];
			readonly sources: readonly EntityRef[];
	  }
	/** Fields set on a record that already existed. */
	| {
			readonly kind: 'record';
			readonly entity?: EntityRef;
			readonly changed: readonly FieldChange[];
	  }
	/** Things that did not exist before this call. */
	| { readonly kind: 'created'; readonly entities: readonly EntityRef[] }
	/** A thing's existence changed — trashed, restored, deleted for good. */
	| { readonly kind: 'lifecycle'; readonly entity?: EntityRef; readonly recoverable: boolean }
	/**
	 * Work put up for review rather than applied. A memory proposal carries what it proposed,
	 * because the judgement is against the set it would join rather than against the sentence
	 * on its own — "remember that Chidi prefers X" is only decidable next to what is already
	 * remembered.
	 */
	| {
			readonly kind: 'proposal';
			readonly scope: 'memory' | 'suggestion';
			readonly projectId?: string;
			readonly operation?: string;
			readonly content?: string;
	  }
	/** Something went wrong, said in the reader's terms. */
	| { readonly kind: 'failure'; readonly explanation: string };

type Family = ToolFamily;

/**
 * The catalog, by family. Total over `TOOL_DESCRIPTIONS` — the spec beside this file asserts
 * it, so a tool added later cannot quietly fall through to a shape guess.
 */
const asString = (value: AgentPayload | undefined): string | undefined =>
	typeof value === 'string' && value.trim() ? value : undefined;

/** Unknown external tools alone use a shape fallback. */
const collectionOf = (output: AgentPayload | undefined): readonly AgentPayload[] | undefined => {
	if (output === undefined) return undefined;
	const top = agentPayloadItems(output);
	if (top) return top;
	if (!isAgentPayloadObject(output)) return undefined;
	const arrays = Object.values(output)
		.map(agentPayloadItems)
		.filter((value) => value !== undefined);
	return arrays.length ? arrays.flat() : undefined;
};

/**
 * What the call set, from the arguments — the one place that says which fields were meant to
 * change, since every mutating tool returns the record whole and says nothing about which part
 * of it moved. `previous`, where a tool troubles to return it, supplies the before.
 */
const displayValue = (value: AgentPayload): string => {
	if (value === null) return 'Cleared';
	if (typeof value === 'boolean') return value ? 'On' : 'Off';
	const items = agentPayloadItems(value);
	if (items) return items.map(displayValue).join(', ');
	if (isAgentPayloadObject(value))
		return Object.entries(value)
			.map(([key, field]) => `${argumentLabel(key)}: ${displayValue(field)}`)
			.join(' · ');
	return String(value);
};

const changesFrom = (tool: ChatToolActivity): readonly FieldChange[] => {
	const output = toolOutput(tool);
	const previous =
		output !== undefined && isAgentPayloadObject(output) && isAgentPayloadObject(output.previous)
			? output.previous
			: undefined;
	// No `!== undefined` guard: a `AgentPayload` has no such member, which is one of
	// the checks naming the wire type retires outright.
	const values =
		tool.name.startsWith('get_') && output !== undefined && isAgentPayloadObject(output)
			? output
			: tool.arguments;
	return Object.entries(values)
		.filter(
			([key, value]) =>
				!isIdentifierArgument(key, value) &&
				![
					'previous',
					'etag',
					'source',
					'markdown',
					'edits',
					'title',
					'name',
					'createdAt',
					'updatedAt'
				].includes(key)
		)
		.map(([key, value]) => {
			const from = previous ? asString(String(previous[key] ?? '')) : undefined;
			return {
				label: argumentLabel(key),
				...(from !== undefined ? { from } : {}),
				to: displayValue(value)
			};
		});
};

const shapeGuess = (tool: ChatToolActivity): Family => {
	const output = toolOutput(tool);
	if (collectionOf(output)) return 'collection';
	if (output !== undefined && isAgentPayloadObject(output) && Object.keys(output).length > 0)
		return 'record';
	return 'none';
};

/**
 * What a look inside the virtual files came back with. The wire shapes are the
 * `AgentGrepResult` / `AgentSedResult` / `AgentLsResult` unions from
 * `$lib/models/agent-files`, read off the payload the run journalled. A call
 * still running has produced nothing, so it earns no chevron yet — the same
 * "disclosure is earned" rule the rest of this file follows.
 */
const fileOutput = (tool: ChatToolActivity, shell?: ShellContext): ToolDisclosure => {
	const output = toolOutput(tool);
	if (output === undefined || !isAgentPayloadObject(output)) return { kind: 'none' };

	if (output.kind === 'error')
		return {
			kind: 'file-output',
			headline: asString(output.message) ?? 'The file could not be read.',
			lines: [],
			sources: []
		};

	if (output.kind === 'matches') {
		const matches = agentPayloadItems(output.matches) ?? [];
		return {
			kind: 'file-output',
			headline: matches.length === 1 ? '1 match' : `${matches.length} matches`,
			sources: [
				...new Set(
					matches.flatMap((match) =>
						isAgentPayloadObject(match) && typeof match.path === 'string' ? [match.path] : []
					)
				)
			].map((path) => fileEntity(path, shell)),
			lines: matches.flatMap((match) => {
				if (!isAgentPayloadObject(match)) return [];
				const line = match.line;
				if (typeof line !== 'string') return [];
				const path = asString(match.path);
				const target = path ? fileEntity(path, shell) : undefined;
				const title = target?.named ? target.title : undefined;
				const source = title ?? path;
				const context =
					typeof match.lineNumber === 'number'
						? source
							? `${source}:${match.lineNumber}`
							: `Line ${match.lineNumber}`
						: source;
				return [
					{
						text: line,
						...(context ? { context } : {}),
						...(target ? { source: target } : {}),
						...(typeof match.lineNumber === 'number' ? { lineNumber: match.lineNumber } : {})
					}
				];
			})
		};
	}

	if (output.kind === 'no_matches')
		return { kind: 'file-output', headline: 'No matches', lines: [], sources: [] };

	if (output.kind === 'content') {
		const content = typeof output.content === 'string' ? output.content : '';
		const start = typeof output.startLine === 'number' ? output.startLine : undefined;
		const end = typeof output.endLine === 'number' ? output.endLine : undefined;
		return {
			kind: 'file-output',
			headline: start !== undefined && end !== undefined ? `Lines ${start}–${end}` : 'File excerpt',
			sources: typeof output.path === 'string' ? [fileEntity(output.path, shell)] : [],
			lines: content.split('\n').map((text, index) => ({
				text,
				...(start === undefined ? {} : { context: String(start + index) })
			}))
		};
	}

	if (output.kind === 'listed') {
		const entries = agentPayloadItems(output.entries) ?? [];
		return {
			kind: 'file-output',
			headline: entries.length === 1 ? '1 entry' : `${entries.length} entries`,
			sources: entries.flatMap((entry) =>
				isAgentPayloadObject(entry) && typeof entry.path === 'string'
					? [fileEntity(entry.path, shell)]
					: []
			),
			lines: entries.flatMap((entry) => {
				if (!isAgentPayloadObject(entry)) return [];
				const path = asString(entry.path);
				if (!path) return [];
				const source = fileEntity(path, shell);
				return [{ text: source.named ? source.title : path, source }];
			})
		};
	}

	// An output shape this family does not recognise says nothing honest, so the
	// row stays flat rather than opening onto a guess.
	return { kind: 'none' };
};

export function toolDisclosure(tool: ChatToolActivity, shell?: ShellContext): ToolDisclosure {
	// A failure outranks the family. Whatever the call was going to show, what it has to say now
	// is that it did not happen, and what the reader can do about that.
	const failure = toolFailure(tool);
	if (failure) return { kind: 'failure', explanation: explainToolFailure(failure) };

	const definition = toolPresentationKind(tool.name);
	const family = definition?.family ?? shapeGuess(tool);
	const kind = definition?.kind ?? 'plain';

	switch (family) {
		case 'none':
			return { kind: 'none' };

		case 'link':
			return { kind: 'link', entity: toolEntity(tool, shell) };

		case 'collection':
			return toolCollection(tool, kind, shell);

		case 'file-output':
			return fileOutput(tool, shell);

		case 'record': {
			const entity = toolEntity(tool, shell);
			return {
				kind: 'record',
				...(entity.id || entity.named ? { entity } : {}),
				changed: changesFrom(tool)
			};
		}

		case 'created': {
			const items = collectionOf(toolOutput(tool));
			return {
				kind: 'created',
				entities: items
					? items.map((item) => entityFrom(item, kind, shell))
					: [toolEntity(tool, shell)]
			};
		}

		case 'lifecycle': {
			const entity = toolEntity(tool, shell);
			return {
				kind: 'lifecycle',
				...(entity.id || entity.named ? { entity } : {}),
				recoverable: ['archive_note', 'archive_project', 'restore_note'].includes(tool.name)
			};
		}

		case 'proposal': {
			if (kind !== 'memory') return { kind: 'proposal', scope: 'suggestion' };
			const projectId = asString(tool.arguments.projectId);
			const operation = asString(tool.arguments.operation);
			const content = asString(tool.arguments.content);
			return {
				kind: 'proposal',
				scope: 'memory',
				...(projectId ? { projectId } : {}),
				...(operation ? { operation } : {}),
				...(content ? { content } : {})
			};
		}
	}
}

/**
 * Whether a row should carry a chevron. `none` has nothing behind it and `link` puts what it
 * has on the row itself, so both stay flat — which is most calls in most turns.
 */
export const opensInPlace = (disclosure: ToolDisclosure): boolean =>
	disclosure.kind === 'file-output' && disclosure.lines.length > 0;

/**
 * The family a tool was explicitly given, or `undefined` if it would fall through to a guess
 * at its payload. Exported for the spec that holds this map total over the catalog: a guess is
 * a reasonable last resort for a name we have never seen, and a bug for one shipped in
 * `TOOL_DESCRIPTIONS`.
 */
export const toolFamily = (name: string): Family | undefined => toolPresentationKind(name)?.family;
