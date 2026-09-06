/**
 * One geometry for every row inside a turn: the things the turn touched, and the calls
 * behind its log door. The two had drifted to two paddings, two gaps and two heights, which
 * in a 384px column reads as two kinds of list rather than one.
 *
 * A class string rather than an `@utility`, and the reason is `cn()`. It is clsx plus
 * tailwind-merge, and merge can only cancel a class it recognises as conflicting with
 * another. Every one of these rows is a `<Button>` whose `buttonVariants` base carries
 * `inline-flex`, `justify-center` and `font-medium`; against a custom utility those have no
 * counterpart to be merged away and would survive into the row — the trap AGENTS.md
 * describes. Spelled out as real utilities they are cancelled properly, whatever the order
 * the stylesheet happens to emit.
 */
/**
 * The `aria-expanded` cancellation is load-bearing. `buttonVariants.ghost` paints
 * `aria-expanded:bg-muted`, which is right for a menu or popover trigger: it stays lit
 * while a surface it owns is open somewhere else on screen. A disclosure is the opposite
 * case — what it opened is directly underneath it — and `Collapsible.Trigger` sets the
 * same attribute. So an open "N steps" row and the open call row inside it each became a
 * filled rectangle, one nested in the other, which is the one thing the surface rule in
 * docs/design/design-system.md ("list before card") exists to prevent. Hover still washes; the row is
 * still plainly a control.
 */
export const CHAT_ROW =
	'flex h-auto w-full items-center justify-start gap-2 rounded-md px-2 py-1.5 text-left text-xs font-normal aria-expanded:bg-transparent aria-expanded:text-inherit';

/**
 * The statement line of a thing the turn touched: the name, its verb, and the way in.
 *
 * One step above `CHAT_ROW`, and that step is the whole hierarchy. Everything subordinate to a
 * thing — what the agent asked it, what came back, what it changed — renders at
 * `provenance-caption` beneath it, and `xs` is the floor: with the statement also at `xs` there
 * was no room left to put anything below it, so a call, its arguments and its results all
 * arrived at one size and the reader had to parse them apart by punctuation.
 */
export const CHAT_ROW_STATEMENT =
	'flex h-auto w-full items-center justify-start gap-2 rounded-md px-2 py-1 text-left text-sm font-normal aria-expanded:bg-transparent aria-expanded:text-inherit';

/** Every icon on a chat row, so a column of rows shares one optical grid. */
export const CHAT_ROW_ICON = 'size-3.5 shrink-0';

/**
 * Detail disclosed by a row, indented under the chevron that opened it. `pl-6` is the row's
 * own padding plus the chevron it aligns beneath, so the detail starts where the row's text
 * does.
 */
export const CHAT_ROW_DETAIL = 'chat-disclosure';

/** The indent detail sits at, matching the row text above it. */
export const CHAT_ROW_INDENT = 'pl-6';

/**
 * The one vertical ladder inside a turn's activity.
 *
 * Everything here used to be spaced by one of two values, 4px and 8px. At 12px type a 4px
 * difference is below the size the eye reads as a grouping, so an opened row arrived as a flat
 * column: the excerpt under "Searched for" sat as far from its own request as the next request
 * sat from it, and "Read all of it" scanned as a sibling of the labels rather than as the footer
 * of the block it opens. Equal gaps flatten a surface however well its content is grouped —
 * docs/design/design-system.md says so, and this surface was the counter-example.
 *
 * Three levels, and each step is large enough to be seen without being measured. Declared here
 * beside the row geometry, and never picked by hand at a call site, because two components each
 * choosing "about a gap-2" is how the flatness got here in the first place.
 *
 * With the code lines above them and the turn stack below, the full ladder is
 * 2 → 4 → 12 → 20 → 24.
 */

/** 4px. A request and the evidence it introduces, plus that evidence's own footer link. */
export const CHAT_GAP_BOND = 'gap-1';

/** 12px. Between passes over one thing. Three times the bond, which is what makes it visible. */
export const CHAT_GAP_PASS = 'gap-3';

/**
 * 20px. Between things, failures and the read door.
 *
 * 20 rather than 24, and not to be tidied: `chat-thread.svelte` spends 24px separating one turn
 * from the next, and a gap inside a turn must stay under the gap between turns or the turn stops
 * reading as one thing.
 */
export const CHAT_GAP_THING = 'gap-5';

/**
 * What the agent did, against everything on this surface that is not the agent acting.
 *
 * Teal marks an agent action and nothing else. "Read note", "Searched for", "Read lines
 * 130–159", "Edited note" are the things the agent did; the search string beside one of them is
 * the reader's own words, the excerpt beneath it is the note's own content, and neither is an
 * action, so neither takes the colour. Weight then separates the actions from each other: a
 * write carries medium, a look stays regular. So the column answers two questions in one
 * glance — what did it do, and which of those changed my work.
 *
 * No size change: the size ladder is already spoken for by `CHAT_ROW_STATEMENT` over
 * `provenance-caption`, and a third size would say "bigger thing" where this only means "this
 * one is the agent". The caller supplies the size, so one rule serves the `xs` pass labels, the
 * `xs` running steps and the `sm` verb on a statement row.
 *
 * The consequence elsewhere is "Read all of it", which is a control the reader operates rather
 * than something the agent did. It gave up the teal it had as a link variant; see
 * `thing-passes.svelte`.
 */
export const chatActionEmphasis = (mutating: boolean): string =>
	mutating ? 'font-medium text-brand' : 'text-brand';
