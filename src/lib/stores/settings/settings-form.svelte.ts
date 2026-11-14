/** One preference a settings form edits; `null` means it follows the deployment's default. */
export type SettingValue = string | number | boolean | null;

/** A settings form's values, keyed by the preference each control writes. */
export type SettingValues = { readonly [setting: string]: SettingValue };

/** A settings form's edits beside the values it last saved, changed only through these updates. */
export interface SettingsForm<T extends SettingValues> {
	/** The values the controls show, saved or not. */
	readonly values: T;
	/** Whether any value differs from its saved one; editing a value back clears it. */
	readonly dirty: boolean;
	set<K extends keyof T>(setting: K, value: T[K]): void;
	/** Puts every value back to what was last saved. */
	undo(): void;
	/** Records `values`, as submitted, as saved; anything edited since stays unsaved. */
	commit(values: T): void;
}

interface SettingsFormState<T extends SettingValues> {
	readonly edited: T;
	readonly saved: T;
}

/**
 * One settings form's edits beside the values it last saved. An edit changes only the form
 * until a save commits it, so the form can tell what is unsaved and put it back.
 */
export class SettingsFormStore<T extends SettingValues> implements SettingsForm<T> {
	// Raw, not deep: every update replaces the values, and the staged command carries them
	// into IndexedDB, which cannot clone a state proxy.
	private state: SettingsFormState<T>;
	constructor(saved: T) {
		this.state = $state.raw({ edited: saved, saved });
	}
	get values(): T {
		return this.state.edited;
	}
	get dirty(): boolean {
		const { edited, saved } = this.state;
		return Object.keys(edited).some((setting) => edited[setting] !== saved[setting]);
	}
	set<K extends keyof T>(setting: K, value: T[K]): void {
		this.state = { ...this.state, edited: { ...this.state.edited, [setting]: value } };
	}
	undo(): void {
		this.state = { ...this.state, edited: this.state.saved };
	}
	commit(values: T): void {
		this.state = { ...this.state, saved: values };
	}
}
