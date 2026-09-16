/** A released skill body and the metadata used to identify an untouched installation. */
export interface BuiltInSkillDefinition<Surface extends string = string> {
	readonly key: string;
	readonly name: string;
	readonly description: string;
	readonly instructions: string;
	readonly triggerHints: readonly string[];
	readonly allowImplicitInvocation: boolean;
	readonly version?: string;
	/** Screens that request this skill on the user's behalf. */
	readonly surfaces?: readonly Surface[];
}
