import { describe, expect, it } from 'vitest';
import { cn } from '$lib/utils';
import { buttonVariants } from '$lib/components/ui/button';
import { CHAT_ROW } from './chat-row';

/**
 * The mechanical half of the nesting.
 *
 * `buttonVariants.ghost` paints `aria-expanded:bg-muted`, which is right for a menu or
 * popover trigger that stays lit while a surface it owns is open elsewhere. A disclosure is
 * the opposite case — what it opened is directly underneath — and `Collapsible.Trigger` sets
 * the same attribute, so an open "N steps" row and the open call row inside it each became a
 * filled rectangle, one nested in the other.
 *
 * The cancellation only works because `cn` is tailwind-merge and the caller's class is
 * appended last. That is a property of a dependency rather than of our code, and it is
 * exactly the class of thing worth pinning: if a merge upgrade stopped treating these two as
 * conflicting, the grey bars would come back with nothing to point at.
 */
describe('An open chat row does not paint itself', () => {
	const ghost = buttonVariants({ variant: 'ghost', size: 'sm' });

	it('cancels the ghost variant expanded fill', () => {
		expect(cn(ghost, CHAT_ROW)).not.toMatch(/(^|\s)aria-expanded:bg-muted(\s|$)/);
	});

	it('keeps the hover wash, so the row still reads as a control', () => {
		expect(cn(ghost, CHAT_ROW)).toMatch(/hover:bg-muted/);
	});
});
