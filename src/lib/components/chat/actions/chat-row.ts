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
export const CHAT_ROW =
	'flex h-auto w-full items-center justify-start gap-2 rounded-md px-2 py-1.5 text-left text-xs font-normal';

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
