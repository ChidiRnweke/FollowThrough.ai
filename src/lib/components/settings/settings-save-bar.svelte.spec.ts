import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SettingsSaveBar from './settings-save-bar.svelte';

const ignore = (): void => undefined;

it('offers no save while every value is saved', async () => {
	const screen = await render(SettingsSaveBar, { dirty: false, saving: false, onundo: ignore });
	await expect
		.element(screen.getByRole('button', { name: 'Save', exact: true }))
		.not.toBeInTheDocument();
});

it('asks for an undo when Undo is pressed on unsaved changes', async () => {
	let undos = 0;
	const screen = await render(SettingsSaveBar, {
		dirty: true,
		saving: false,
		onundo: () => {
			undos += 1;
		}
	});
	await screen.getByRole('button', { name: 'Undo', exact: true }).click();
	expect(undos).toBe(1);
});

it('holds both actions while a save is in flight', async () => {
	const screen = await render(SettingsSaveBar, { dirty: true, saving: true, onundo: ignore });
	await expect.element(screen.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await expect.element(screen.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});
