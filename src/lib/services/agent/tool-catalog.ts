import {
	TOOL_DESCRIPTIONS,
	FIRST_CLASS_TOOL_NAMES,
	type ToolName,
	type ToolCatalogEntry
} from '../../models/agent/tool-catalog.ts';
/**
 * Membership for callers holding a {@link ToolName}. The const tuple above
 * carries literals so {@link FirstClassToolName} can exist, which also means
 * its own `includes` rejects any name outside the first-class set — the
 * question every caller is actually asking.
 */
export const FIRST_CLASS_TOOL_SET: ReadonlySet<ToolName> = new Set<ToolName>(
	FIRST_CLASS_TOOL_NAMES
);

/**
 * The on-demand catalog surfaced through search_tools: everything but
 * first-class tools.
 *
 * The `name: ToolName` intersection is what keeps the literal names the const
 * assertion above earned. A plain `readonly ToolCatalogEntry[]` annotation
 * widened every entry's name back to `string`, so a caller could not test one
 * against the catalog without widening its own type to match.
 * {@link ToolCatalogEntry} itself cannot declare `name: ToolName`, because
 * {@link ToolName} is derived from the descriptions that satisfy it.
 *
 * Its element type stays {@link ToolName} rather than {@link LongTailToolName}:
 * `filter` cannot prove the partition, so narrowing it would take a
 * hand-written type predicate — an unchecked claim, which is the thing this
 * effort removes. `tool-catalog.spec.ts` holds the partition at runtime.
 */
export const TOOL_CATALOG: readonly (ToolCatalogEntry & { readonly name: ToolName })[] =
	TOOL_DESCRIPTIONS.filter((entry) => !FIRST_CLASS_TOOL_SET.has(entry.name));

/** Looks up a tool description; throws if the catalog and definitions drift apart. */
export const toolDescription = (name: string): string => {
	const entry = TOOL_DESCRIPTIONS.find((candidate) => candidate.name === name);
	if (!entry) throw new Error(`Tool description missing from catalog: ${name}`);
	return entry.description;
};
