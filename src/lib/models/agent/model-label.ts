/**
 * How a chosen model is named where there is only room for a name.
 *
 * The domain is self-contained, so the catalogue entry arrives structurally
 * rather than as an import of `AgentModel`: these helpers need three strings and
 * nothing else, and saying so keeps them usable from a picker row, a composer
 * chip, and a test fixture alike.
 */
export interface NamedModel {
	readonly id: string;
	readonly name: string;
	readonly provider: string;
}

/**
 * The name a chat bar has room for.
 *
 * OpenRouter display names lead with the vendor ("Anthropic: Claude Sonnet 4.5"),
 * which is the half a reader already knows from the model itself. A bare id
 * arrives here when the catalogue does not carry the model — a deployment
 * default the account cannot list, say — and its last path segment is the
 * closest thing to a name that exists.
 */
export const shortModelName = (name: string): string => {
	const afterVendor = name.slice(name.lastIndexOf(':') + 1).trim();
	const candidate = afterVendor.length > 0 ? afterVendor : name.trim();
	const afterPath = candidate.slice(candidate.lastIndexOf('/') + 1).trim();
	return afterPath.length > 0 ? afterPath : candidate;
};

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

const labelFor = (models: readonly NamedModel[], id: string): string =>
	shortModelName(models.find((model) => model.id === id)?.name ?? id);

export const effectiveModel = (
	models: readonly NamedModel[],
	override: string | null,
	defaultModelId: string
): EffectiveModel =>
	override
		? { source: 'conversation', id: override, label: labelFor(models, override) }
		: { source: 'workspace', id: defaultModelId, label: labelFor(models, defaultModelId) };

/**
 * A context window at the precision a reader actually uses.
 *
 * `1048576` rendered in full is nine characters of a figure nobody compares
 * digit by digit, and in a picker row it crowded out the model's name — the one
 * thing the row exists to say. The magnitude is the whole signal.
 */
export const compactContextLength = (tokens: number): string => {
	if (tokens >= 1_000_000) {
		const millions = tokens / 1_000_000;
		return `${millions >= 10 ? Math.round(millions) : Math.round(millions * 10) / 10}M`;
	}
	if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
	return String(tokens);
};

/** What a picker row can say about a model besides its name. */
export interface DescribedModel extends NamedModel {
	readonly contextLength?: number;
	readonly supportsTools: boolean;
	readonly supportsVision: boolean;
}

/**
 * The second line of a picker row: the vendor, then only the facts this model
 * actually carries.
 *
 * An absent context length is omitted rather than printed as an em dash. A row
 * is a list item, not a property panel, and "do not render a control for a value
 * that is not set" applies — a dash there is noise that reads as content.
 */
export const modelMetaLine = (model: DescribedModel): string =>
	[
		model.provider,
		model.contextLength === undefined
			? undefined
			: `${compactContextLength(model.contextLength)} context`,
		model.supportsVision ? 'sees images' : undefined,
		model.supportsTools ? undefined : 'no tools'
	]
		.filter((part) => part !== undefined)
		.join(' · ');

/**
 * Whether a model matches what someone typed.
 *
 * Owned here rather than left to the Command primitive's own filter because the
 * picker renders the catalogue's long tail only once a query exists, and it has
 * to make that decision before the primitive gets a chance to filter.
 */
export const modelMatchesQuery = (model: NamedModel, query: string): boolean => {
	const needle = query.trim().toLowerCase();
	if (needle.length === 0) return true;
	return `${model.name} ${model.provider} ${model.id}`.toLowerCase().includes(needle);
};
