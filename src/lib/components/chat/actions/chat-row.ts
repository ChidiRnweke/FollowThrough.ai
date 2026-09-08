/**
 * One geometry for every row inside a turn: the subjects the turn touched, and the calls
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
	'flex h-auto w-full items-center justify-start gap-2 rounded-md px-2 py-1.5 text-left text-label font-normal aria-expanded:bg-transparent aria-expanded:text-inherit';

/**
 * The statement line of a subject the turn touched: the name, its verb, and the way in.
 *
 * The top of the turn's own ladder, one rung under the answer it belongs to. See
 * `CHAT_TEXT_REQUEST` for the rest of it.
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
 * The one type hierarchy inside a turn's activity.
 *
 * The turn stacks four levels in a 384px column, and the app has only two rungs to spend on
 * them — `sm` and `xs`. So a pass label and the excerpt it introduces were the same 12px, and
 * the label did not read as the title of the block underneath it. Depth was carried by
 * indentation alone.
 *
 *     14px  the assistant's answer      the prose this whole block explains
 *     14px  a subject                   `CHAT_ROW_STATEMENT` — atlas · edited
 *     13px  a request                   `CHAT_TEXT_REQUEST` — Read lines 124–136
 *     11px  the evidence                `CHAT_TEXT_EVIDENCE` — what came back
 *
 * A subject sits level with the answer rather than under it, and that is the right reading: the
 * activity block is not subordinate prose, it is the record standing beside the answer. Nothing
 * inside it is ever larger.
 *
 * The steps below that are 1 / 2. The 1px step is deliberate and it is placed where size is
 * doing the least work: a subject is a foreground name at medium weight and its requests are
 * teal and indented 24px beneath it, so three other signals already separate them. One pixel is
 * not a level on its own — nobody can see 13 against 14 in isolation — and it is never asked to
 * be one here. The 13→11 step is the boundary a reader must actually see, so it gets 2px, plus
 * mono, plus the wash edge.
 *
 * Declared here and never picked at a call site, for the reason the gaps are: two components
 * each reaching for "about an `xs`" is how the flatness arrived.
 */

/** 13px. A line that titles the block beneath it: a request, the read door, a failure. */
export const CHAT_TEXT_REQUEST = 'text-label';

/**
 * 11px. What came back — an excerpt, a field list, a matched line.
 *
 * Below the 12px floor that holds for UI text, and allowed to be, because this rung only ever
 * carries quoted machine output in a column too narrow to read it in anyway. The reader skims
 * it here and opens "Read all of it" to actually read it, where it renders at body size.
 */
export const CHAT_TEXT_EVIDENCE = 'text-2xs';

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

/** 12px. Between passes over one subject. Three times the bond, which is what makes it visible. */
export const CHAT_GAP_PASS = 'gap-3';

/**
 * 20px. Between subjects, failures and the read door.
 *
 * 20 rather than 24, and not to be tidied: `chat-thread.svelte` spends 24px separating one turn
 * from the next, and a gap inside a turn must stay under the gap between turns or the turn stops
 * reading as one thing.
 */
export const CHAT_GAP_SUBJECT = 'gap-5';

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
 * Carries no size of its own: size says how deep a line sits, and this says who acted. The
 * caller supplies the rung, so one rule serves a request label, a running step and the verb on
 * a subject row, each at its own level.
 *
 * The consequence elsewhere is "Read all of it", which is a control the reader operates rather
 * than something the agent did. It gave up the teal it had as a link variant; see
 * `subject-passes.svelte`.
 */
export const chatActionEmphasis = (mutating: boolean): string =>
	mutating ? 'font-medium text-brand' : 'text-brand';
