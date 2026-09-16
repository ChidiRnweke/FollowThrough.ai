/**
 * The catalogue identity and display values available to model pickers.
 */
export interface NamedModel {
	readonly id: string;
	readonly name: string;
	readonly provider: string;
}

/**
 * The models a conversation inherits when it chooses none of its own.
 *
 * Resolved on the server, because the last link in that chain is deployment
 * configuration: a client that guessed would name a model no run uses.
 */
export interface AgentModelDefaults {
	readonly chatModelId: string;
	readonly visionModelId: string;
}

/**
 * The model a conversation will actually run on, and where the choice came from.
 *
 * Two arms rather than a source beside an optional id: `defaultModelId` is
 * resolved on the server and always present, so "no model" is not a state that
 * can be reached. The distinction is the whole point of showing this — naming a
 * model without saying whether this chat chose it is what left readers unable to
 * tell their own choice from the workspace's.
 */
export type EffectiveModel =
	| { readonly source: 'conversation'; readonly id: string; readonly label: string }
	| { readonly source: 'workspace'; readonly id: string; readonly label: string };

/** What a picker row can say about a model besides its name. */
export interface DescribedModel extends NamedModel {
	readonly contextLength?: number;
	readonly supportsTools: boolean;
	readonly supportsVision: boolean;
}
