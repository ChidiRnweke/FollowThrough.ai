import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '$lib/models/notes';
import type { ShellContext } from '$lib/models/workspace';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import type { ToolActivityOverrides } from '$lib/testing/agent/tool-activity';
import { readDoorLabel, turnContext } from './turn-context';

const ROSSEL = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';
const BRIEF = '2f0f5a2c-1c22-4a7f-9d1f-7cf4a1f2b0d1';

const shell = {
	projects: [{ id: 'proj-1', name: 'Rossel' }],
	noteTree: [
		{ id: ROSSEL, title: 'rossel', projectId: 'proj-1' },
		{ id: BRIEF, title: 'element61 brief', projectId: 'proj-1' }
	] as unknown as NoteSummary[]
} as unknown as ShellContext;

const call = (over: ToolActivityOverrides): ChatToolActivity => ({
	callId: '00000000-0000-4000-8000-0000000000aa',
	name: 'get_note',
	arguments: { noteId: ROSSEL },
	status: 'succeeded',
	...over
});

const notePath = (id: string) => `/projects/proj-1/notes/${id}.md`;

const grep = (over: { readonly noteIds?: readonly string[] } = {}) =>
	call({
		name: 'grep',
		arguments: { pattern: 'element61', path: '/' },
		output: {
			kind: 'matches',
			matches: (over.noteIds ?? [ROSSEL]).map((id, index) => ({
				path: notePath(id),
				lineNumber: 198 + index,
				line: `element61 line for ${id}`
			}))
		}
	});

const sed = () =>
	call({
		name: 'sed',
		arguments: { path: notePath(ROSSEL), range: { kind: 'range', startLine: 188, endLine: 221 } },
		output: {
			kind: 'content',
			path: notePath(ROSSEL),
			startLine: 188,
			endLine: 221,
			content: 'GOV -. governs .-> TOOL'
		}
	});

const edit = () =>
	call({
		name: 'edit_note',
		arguments: { noteId: ROSSEL, edits: [{ oldText: 'a', newText: 'b' }] },
		output: { noteId: ROSSEL, title: 'rossel', appliedEdits: 1, currentRevision: 3 }
	});

describe('A turn is folded into the things it touched', () => {
	const turn = () => turnContext([call({}), grep(), sed(), edit(), sed()], shell);

	it('states one note once, however many calls touched it', () => {
		expect(turn().changed).toHaveLength(1);
	});

	it('names it', () => {
		expect(turn().changed[0]?.entity.title).toBe('rossel');
	});

	it('reports the strongest verb that befell it, not the last or the first', () => {
		expect(turn().changed[0]?.verb).toBe('edited');
	});

	it('keeps every pass over it, in the order they happened', () => {
		expect(turn().changed[0]?.passes.map((pass) => pass.label)).toEqual([
			'Read note',
			'Searched for',
			'Read lines 188–221',
			'Edited note',
			'Read lines 188–221'
		]);
	});

	it('leaves nothing behind the read door, because the note was changed', () => {
		expect(turn().read).toHaveLength(0);
	});
});

describe('A pass carries what the agent asked for', () => {
	it('names the search string apart, so the row can render it as the reader own words', () => {
		expect(turnContext([grep()], shell).read[0]?.passes[0]?.query).toBe('element61');
	});

	it('names the lines an excerpt took', () => {
		expect(turnContext([sed()], shell).read[0]?.passes[0]?.label).toBe('Read lines 188–221');
	});
});

describe('A search files its matches under the notes they were found in', () => {
	const spread = () => turnContext([grep({ noteIds: [ROSSEL, BRIEF] })], shell);

	it('gives every matched note a row of its own', () => {
		expect(spread().read.map((thing) => thing.entity.title)).toEqual(['rossel', 'element61 brief']);
	});

	it('shows each note only the lines that matched in it', () => {
		const evidence = spread().read[1]?.passes[0]?.evidence;
		expect(evidence?.kind === 'passages' && evidence.lines).toHaveLength(1);
	});
});

describe('A read is context, not a change', () => {
	it('puts a note the turn only searched behind the read door', () => {
		expect(turnContext([grep()], shell).read).toHaveLength(1);
	});

	it('keeps it out of the thread', () => {
		expect(turnContext([grep()], shell).changed).toHaveLength(0);
	});

	it('says what it read, in things rather than in calls', () => {
		expect(readDoorLabel(turnContext([grep(), sed()], shell))).toBe('Read 1 note');
	});
});

describe('Nothing is counted that is also shown', () => {
	// `1 edit` above one edit, `1 match` above one match: the count and the thing it counts
	// said the same fact twice, ten pixels apart.
	it('never states how many edits an edit applied', () => {
		const passes = turnContext([edit()], shell).changed[0]?.passes ?? [];
		expect(JSON.stringify(passes)).not.toContain('edit');
	});

	it('never states how many matches a search found', () => {
		const passes = turnContext([grep()], shell).read[0]?.passes ?? [];
		expect(JSON.stringify(passes)).not.toContain('match');
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
			arguments: { pattern: 'element62', path: '/' },
			output: { kind: 'no_matches' }
		});
		expect(turnContext([empty], shell).barren[0]?.query).toBe('element62');
	});
});

describe('A proposal awaiting a decision is already on screen', () => {
	it('is not repeated as a row of the turn', () => {
		const pending = call({
			name: 'propose_memory_change',
			status: 'approval_required',
			arguments: { scope: 'project', operation: 'add', content: 'Rossel runs on element61.' }
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
			arguments: { noteId: ROSSEL },
			failure: 'oldText was not found in the note.'
		});

	it('reports a change nothing recovered', () => {
		expect(turnContext([failed()], shell).failures).toHaveLength(1);
	});

	it('says nothing about an attempt the turn later got right', () => {
		expect(turnContext([failed(), edit()], shell).failures).toHaveLength(0);
	});

	it('names what the failure befell, so the reader can go and look', () => {
		expect(turnContext([failed()], shell).failures[0]?.subjects[0]?.title).toBe('rossel');
	});
});
