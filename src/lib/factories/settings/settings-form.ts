import {
	SettingsFormStore,
	type SettingsForm,
	type SettingValues
} from '$lib/stores/settings/settings-form.svelte';
export const createSettingsForm = <T extends SettingValues>(saved: T): SettingsForm<T> =>
	new SettingsFormStore(saved);
