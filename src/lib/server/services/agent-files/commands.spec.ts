import { AgentFileContentMeter } from '$lib/server/adapters/agent-files/content-measurement';
import { expect, it } from 'vitest';
import type { AgentSedRange } from '$lib/models/agent-files';
import { AgentFileCommandRulesService } from './commands';
import { AgentFileMetadataService } from './metadata';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';

const metadata = new AgentFileMetadataService(new AgentFileContentMeter(testTokenizer));
const file = metadata.file('/a.txt', 'text/plain', 'first\nsecond\nthird');
const rules = new AgentFileCommandRulesService();

it('returns an inclusive range with an exact continuation', () => {
	expect(rules.read(file, { kind: 'lines', startLine: 1, endLine: 2 })).toEqual({
		kind: 'content',
		path: '/a.txt',
		startLine: 1,
		endLine: 2,
		lineCount: 3,
		content: 'first\nsecond',
		nextActions: [
			{
				reason: 'Continue at the next unread line; 1 lines remain.',
				tool: 'sed',
				arguments: { path: '/a.txt', range: { kind: 'to_end', startLine: 3 } }
			}
		]
	});
});
it('finishes at EOF when a valid range end exceeds available lines', () => {
	expect(rules.read(file, { kind: 'lines', startLine: 2, endLine: 9 })).toEqual({
		kind: 'content',
		path: '/a.txt',
		startLine: 2,
		endLine: 3,
		lineCount: 3,
		content: 'second\nthird',
		nextActions: []
	});
});
it('rejects reversed ranges without executing the proposed correction', () => {
	expect(rules.read(file, { kind: 'lines', startLine: 3, endLine: 1 })).toEqual({
		kind: 'error',
		code: 'range_ends_before_start',
		message: 'endLine 1 is before startLine 3; the range was not reordered.',
		requestedPath: '/a.txt',
		nextActions: [
			{
				reason: 'Retry with an ordered inclusive range.',
				tool: 'sed',
				arguments: { path: '/a.txt', range: { kind: 'lines', startLine: 1, endLine: 3 } }
			}
		]
	});
});
it.each<AgentSedRange>([
	{ kind: 'lines', startLine: 4, endLine: 5 },
	{ kind: 'to_end', startLine: 4 }
])('rejects a start after EOF: $kind', (range) => {
	expect(rules.read(file, range)).toMatchObject({
		kind: 'error',
		code: 'range_starts_after_eof',
		requestedPath: '/a.txt',
		lineCount: 3,
		nextActions: [
			{
				tool: 'sed',
				arguments: { path: '/a.txt', range: { kind: 'lines', startLine: 3, endLine: 3 } }
			}
		]
	});
});
it('reports empty content before considering an invalid range', () => {
	expect(
		rules.read(metadata.file('/empty.txt', 'text/plain', ''), {
			kind: 'lines',
			startLine: 2,
			endLine: 1
		})
	).toMatchObject({
		kind: 'error',
		code: 'empty_file',
		nextActions: [{ tool: 'ls', arguments: { path: '/' } }]
	});
});
it('reports a missing path before an invalid RE2 pattern', () => {
	expect(
		rules.search('/missing', { path: '/missing', pattern: '[', fixed: false, ignoreCase: false }, [
			file
		])
	).toMatchObject({ kind: 'error', code: 'path_not_found', requestedPath: '/missing' });
});
it('keeps the original request path and flags in fixed-string recovery', () => {
	expect(
		rules.search(
			'/a.txt',
			{ path: './a.txt', pattern: '(?=first)', fixed: false, ignoreCase: true },
			[file]
		)
	).toMatchObject({
		kind: 'error',
		code: 'invalid_pattern',
		pattern: '(?=first)',
		nextActions: [
			{
				tool: 'grep',
				arguments: { path: './a.txt', pattern: '(?=first)', fixed: true, ignoreCase: true }
			}
		]
	});
});
it('quotes fixed text and applies case-insensitive matching', () => {
	const input = { path: '/', pattern: '[HELLO]', fixed: true, ignoreCase: true };
	expect(
		rules.search('/', input, [metadata.file('/b.txt', 'text/plain', '[hello]\nhello')])
	).toEqual({
		kind: 'matches',
		exitCode: 0,
		path: '/',
		pattern: '[HELLO]',
		matches: [{ path: '/b.txt', lineNumber: 1, line: '[hello]' }]
	});
});
it('preserves path ordering and line ordering across files', () => {
	expect(
		rules.search('/', { path: '/', pattern: '.', fixed: false, ignoreCase: false }, [
			metadata.file('/z.txt', 'text/plain', 'last'),
			file
		])
	).toMatchObject({
		kind: 'matches',
		matches: [
			{ path: '/a.txt', lineNumber: 1, line: 'first' },
			{ path: '/a.txt', lineNumber: 2, line: 'second' },
			{ path: '/a.txt', lineNumber: 3, line: 'third' },
			{ path: '/z.txt', lineNumber: 1, line: 'last' }
		]
	});
});
it('retains empty-line grep matching for empty files', () => {
	expect(
		rules.search('/', { path: '/', pattern: '^$', fixed: false, ignoreCase: false }, [
			metadata.file('/empty.txt', 'text/plain', '')
		])
	).toMatchObject({ kind: 'matches', matches: [{ path: '/empty.txt', lineNumber: 1, line: '' }] });
});
it('lists direct children in order with directory child counts', () => {
	const files = [
		metadata.file('/z.txt', 'text/plain', 'last'),
		metadata.file('/dir/a.txt', 'text/plain', 'first'),
		metadata.file('/dir/b.txt', 'text/plain', 'second')
	];
	expect(rules.listDirectory('/', files)).toEqual({
		kind: 'listed',
		path: '/',
		entries: [{ kind: 'directory', path: '/dir', childCount: 2 }, files[0]!.metadata]
	});
});
