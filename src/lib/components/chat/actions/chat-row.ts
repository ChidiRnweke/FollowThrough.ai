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
 * DESIGN_SYSTEM.md ("list before card") exists to prevent. Hover still washes; the row is
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
