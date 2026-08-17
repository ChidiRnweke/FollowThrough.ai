import { describe, expect, it } from 'vitest';
import { HarperLinter } from './harper-linter';

/**
 * The one test that exercises Harper itself rather than a stand-in.
 *
 * Everything above this adapter is tested against a stub, which proves the
 * editor's behaviour but proves nothing about the part most likely to break: a
 * 16 MB WebAssembly binary, loaded by URL, compiled inside a worker the library
 * spawns for itself. That path differs between `vite dev` and a production
 * build, and a stub would never notice. It lives in `browser-full` rather than
 * the fast suite because booting the binary is the slow thing it is checking.
 */
describe('HarperLinter', () => {
	const linter = new HarperLinter();

	it('boots the WebAssembly checker in a worker', async () => {
		await expect(linter.setup()).resolves.toBeUndefined();
	}, 120_000);

	it('finds a misspelling in ordinary prose', async () => {
		const issues = await linter.lint('I recieve the package tomorrow.');
		expect(issues.map((issue) => issue.text)).toContain('recieve');
	}, 120_000);

	it('offers the correct spelling as a suggestion', async () => {
		const issues = await linter.lint('I recieve the package tomorrow.');
		const misspelling = issues.find((issue) => issue.text === 'recieve');
		expect(misspelling?.suggestions.map((suggestion) => suggestion.replacement)).toContain(
			'receive'
		);
	}, 120_000);

	it('reports the span the word actually occupies', async () => {
		const text = 'I recieve the package tomorrow.';
		const issues = await linter.lint(text);
		const misspelling = issues.find((issue) => issue.text === 'recieve');
		expect(text.slice(misspelling!.start, misspelling!.end)).toBe('recieve');
	}, 120_000);

	it('says nothing about prose that is already correct', async () => {
		const issues = await linter.lint('I receive the package tomorrow.');
		expect(issues).toHaveLength(0);
	}, 120_000);

	it('stops flagging a word once it has been added to the dictionary', async () => {
		await linter.addWord('nweke');
		const issues = await linter.lint('The Nweke report is ready.');
		expect(issues.map((issue) => issue.text)).not.toContain('Nweke');
	}, 120_000);
});
