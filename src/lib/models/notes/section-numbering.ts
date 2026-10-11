/** The value one level of the cascade can take; `undefined` means "inherit". */
export type SectionNumberingSetting = boolean | undefined;

/** The choices the per-document and per-project menus offer. */
export type SectionNumberingLevel = 'on' | 'off' | 'default';

/** The setting each menu choice stores: "default" clears the override so the level inherits. */
export const sectionNumberingSettings: Readonly<
	Record<SectionNumberingLevel, SectionNumberingSetting>
> = { on: true, off: false, default: undefined };

/** What the note workspace needs to render the toggle and the editor. */
export interface SectionNumberingView {
	/** The resolved value after the whole cascade has been applied. */
	readonly effective: boolean;
	/** The note's own override; absent when the note inherits. */
	readonly noteOverride?: boolean;
	/** The project default the note would inherit, itself already resolved against the app default. */
	readonly inherited: boolean;
}
