import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import InputGroupInput from './input-group-input.svelte';
import CommandInputFixture from '../command/command-input.fixture.svelte';

/**
 * The group paints its focus state through
 * `has-[[data-slot=input-group-control]:focus-visible]`, so that attribute on the inner
 * control is the whole contract: without it the teal border, halo and background wash are
 * all dead rules. It regressed silently once, because `Command.Input` passed its own
 * `data-slot` down and the spread landed on top of it.
 */
describe('Marking the control an input group can paint around', () => {
	it('marks the rendered input as the group control', async () => {
		const screen = await render(InputGroupInput, { placeholder: 'Search…' });
		await expect
			.element(screen.getByPlaceholder('Search…'))
			.toHaveAttribute('data-slot', 'input-group-control');
	});

	it('keeps the group control slot when a caller passes its own', async () => {
		const screen = await render(InputGroupInput, {
			placeholder: 'Search…',
			'data-slot': 'command-input'
		});
		await expect
			.element(screen.getByPlaceholder('Search…'))
			.toHaveAttribute('data-slot', 'input-group-control');
	});

	it('marks a command search field as the group control', async () => {
		const screen = await render(CommandInputFixture);
		await expect
			.element(screen.getByPlaceholder('Search models…'))
			.toHaveAttribute('data-slot', 'input-group-control');
	});
});
