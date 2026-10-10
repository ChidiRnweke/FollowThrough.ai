import type { ShellContext } from '$lib/models/workspace-views';
import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '$lib/models/notes';

import { type ChatToolActivity } from '$lib/models/chat';
import type { ToolActivityOverrides } from '$lib/testing/agent/tool-activity';
import { passLabelText, readDoorLabel, runningSteps, turnContext } from './turn-context';

const ATLAS = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';
const BRIEF = '2f0f5a2c-1c22-4a7f-9d1f-7cf4a1f2b0d1';

const shell = {
	projects: [{ id: 'proj-1', name: 'Atlas' }],
	noteTree: [
		{ id: ATLAS, title: 'atlas', projectId: 'proj-1' },
		{ id: BRIEF, title: 'northwind brief', projectId: 'proj-1' }
	] as unknown as NoteSummary[]
} as unknown as ShellContext;

const call = (over: ToolActivityOverrides): ChatToolActivity => ({
	callId: '00000000-0000-4000-8000-0000000000aa',
	name: 'get_note',
	arguments: { noteId: ATLAS },
	status: 'succeeded',
	...over
});

const notePath = (id: string) => `/projects/proj-1/notes/${id}.md`;

const grep = (over: { readonly noteIds?: readonly string[] } = {}) =>
	call({
		name: 'grep',
		arguments: { pattern: 'northwind', path: '/' },
		output: {
			kind: 'matches',
			matches: (over.noteIds ?? [ATLAS]).map((id, index) => ({
				path: notePath(id),
				lineNumber: 198 + index,
				line: `northwind line for ${id}`
			}))
		}
	});

const sed = () =>
	call({
		name: 'sed',
		arguments: { path: notePath(ATLAS), range: { kind: 'range', startLine: 188, endLine: 221 } },
		output: {
			kind: 'content',
			path: notePath(ATLAS),
			startLine: 188,
			endLine: 221,
			content: 'GOV -. governs .-> TOOL'
		}
	});

const edit = () =>
	call({
		name: 'edit_note',
		arguments: { noteId: ATLAS, edits: [{ oldText: 'a', newText: 'b' }] },
		output: { noteId: ATLAS, title: 'atlas', appliedEdits: 1, currentRevision: 3 }
	});

describe('A turn is folded into the things it touched', () => {
	const turn = () => turnContext([call({}), grep(), sed(), edit(), sed()], shell);

	it('states one note once, however many calls touched it', () => {
		const context = turn();
		expect({
			count: context.changed.length,
			title: context.changed[0]?.entity.title,
			verb: context.changed[0]?.verb,
			passes: context.changed[0]?.passes.map((pass) => passLabelText(pass.label, 'atlas')),
			readCount: context.read.length
		}).toEqual({
			count: 1,
			title: 'atlas',
			verb: 'edited',
			passes: [
				'Opened atlas',
				'Searched for',
				'Read lines 188–221',
				'Edited atlas',
				'Read lines 188–221'
			],
			readCount: 0
		});
	});
});

describe('A pass carries what the agent asked for', () => {
	it('names the search string apart, so the row can render it as the reader own words', () => {
		expect(turnContext([grep()], shell).read[0]?.passes[0]?.query).toBe('northwind');
	});

	it('names the lines an excerpt took', () => {
		expect(turnContext([sed()], shell).read[0]?.passes[0]?.label).toEqual({
			kind: 'phrase',
			text: 'Read lines 188–221'
		});
	});
});

describe('A pass over its own subject is named by the row, not by a generic noun', () => {
	// Under a row titled "atlas", "Read note" repeated the subject less clearly than its name.
	it('carries only the verb, so the row can supply the name', () => {
		expect(turnContext([call({ name: 'save_note' })], shell).changed[0]?.passes[0]?.label).toEqual({
			kind: 'subject',
			verb: 'Saved'
		});
	});

	it('keeps a call still in flight as its whole present-tense phrase', () => {
		expect(turnContext([call({ status: 'running' })], shell).read[0]?.passes[0]?.label).toEqual({
			kind: 'phrase',
			text: 'Read note'
		});
	});
});

describe('A pass says whether it wrote', () => {
	// A turn is mostly looking, with one or two lines in it that changed the reader's work. The
	// flag is what lets a row find those lines without reading their labels back as English.
	const firstPass = (tools: readonly ChatToolActivity[]) => {
		const context = turnContext(tools, shell);
		return (context.changed[0] ?? context.read[0])?.passes[0];
	};

	it('marks the pass that changed the note', () => {
		expect(firstPass([edit()])?.mutating).toBe(true);
	});

	it('leaves an excerpt unmarked', () => {
		expect(firstPass([sed()])?.mutating).toBe(false);
	});

	it('leaves a search unmarked', () => {
		expect(firstPass([grep()])?.mutating).toBe(false);
	});

	it('marks a write while it is still running, not only once it settles', () => {
		expect(runningSteps([call({ name: 'edit_note', status: 'running' })])[0]?.mutating).toBe(true);
	});

	it('leaves a running read unmarked', () => {
		expect(runningSteps([call({ status: 'running' })])[0]?.mutating).toBe(false);
	});
});

describe('A search files its matches under the notes they were found in', () => {
	const spread = () => turnContext([grep({ noteIds: [ATLAS, BRIEF] })], shell);

	it('gives every matched note a row of its own', () => {
		const rows = spread().read;
		expect({
			titles: rows.map((thing) => thing.entity.title),
			linesPerNote: rows.map((thing) => {
				const evidence = thing.passes[0]?.evidence;
				return evidence?.kind === 'passages' ? evidence.lines.length : 0;
			})
		}).toEqual({ titles: ['atlas', 'northwind brief'], linesPerNote: [1, 1] });
	});
});

describe('A read is context, not a change', () => {
	it('puts a note the turn only searched behind the read door', () => {
		const context = turnContext([grep()], shell);
		expect({
			reads: context.read.length,
			changed: context.changed.length,
			label: readDoorLabel(context)
		}).toEqual({
			reads: 1,
			changed: 0,
			label: 'Read 1 note'
		});
	});
});

describe('Work that touched nothing is reachable but never prominent', () => {
	it('collects the agent finding its footing as setup', () => {
		expect(
			turnContext([call({ name: 'search_tools', arguments: { query: 'note' } })], shell).setup
		).toEqual(['Look up available tools']);
	});

	it('gives setup no row of its own', () => {
		const context = turnContext([call({ name: 'get_workspace_context', arguments: {} })], shell);
		expect([...context.changed, ...context.read]).toHaveLength(0);
	});

	it('records a search that came back with nothing, because the absence explains the answer', () => {
		const empty = call({
			name: 'grep',
			arguments: { pattern: 'southwind', path: '/' },
			output: { kind: 'no_matches' }
		});
		expect(turnContext([empty], shell).barren[0]?.query).toBe('southwind');
	});
});

describe('A proposal awaiting a decision is already on screen', () => {
	it('is not repeated as a row of the turn', () => {
		const pending = call({
			name: 'propose_memory_change',
			status: 'approval_required',
			arguments: { scope: 'project', operation: 'add', content: 'Atlas runs on northwind.' }
		});
		const context = turnContext([pending], shell);
		expect([...context.changed, ...context.read, ...context.barren]).toHaveLength(0);
	});
});

describe('A failure is news only when nothing put it right', () => {
	const failed = () =>
		call({
			name: 'edit_note',
			status: 'failed',
			arguments: { noteId: ATLAS },
			failure: 'oldText was not found in the note.'
		});

	it('reports a failed change with its subject, explanation, and raw evidence', () => {
		const change = turnContext([failed()], shell).changed[0];
		const evidence = change?.passes.at(-1)?.evidence;
		expect({
			outcome: change?.outcome,
			title: change?.entity.title,
			cause: evidence?.kind === 'failure' ? evidence.cause : undefined,
			raw: evidence?.kind === 'failure' ? evidence.raw : undefined
		}).toEqual({
			outcome: 'failed',
			title: 'atlas',
			cause: expect.stringContaining('The text it meant to change was not where it expected'),
			raw: 'oldText was not found in the note.'
		});
	});

	it('says nothing about an attempt the turn later got right', () => {
		expect(turnContext([failed(), edit()], shell).changed[0]?.outcome).not.toBe('failed');
	});
	// `explainToolFailure` hands back anything it does not recognise, so carrying both would
	// print one sentence twice — the duplication this surface exists to remove.
	it('drops the raw message when it is already the explanation', () => {
		const opaque = call({
			name: 'edit_note',
			status: 'failed',
			arguments: { noteId: ATLAS },
			failure: 'Tool output could not be represented as JSON.'
		});
		const evidence = turnContext([opaque], shell).changed[0]?.passes.at(-1)?.evidence;
		expect(evidence?.kind === 'failure' && evidence.raw).toBeUndefined();
	});
});

describe('A failure the call could not name still gets a row', () => {
	const nameless = (status: 'failed' | 'succeeded') =>
		call({ name: 'search', status, arguments: {}, failure: 'The index is unavailable.' });

	it('names it by the tool, which is the only identity it has', () => {
		const failedOnly = turnContext([nameless('failed')], shell).read;
		const recovered = turnContext([nameless('failed'), nameless('succeeded')], shell).read;
		expect({ failedTitle: failedOnly[0]?.entity.title, recoveredRows: recovered.length }).toEqual({
			failedTitle: 'Search',
			recoveredRows: 0
		});
	});
});
