import { describe, expect, it } from 'vitest';
import { canvasPlacementOf, type KeptStudioTab } from './canvas-placement';
import type { CanvasSubject } from './canvas-subject';
import type { DiagramId } from '$lib/models/diagrams';
import { diagramTab, draftTab, type TabId } from '$lib/stores/workbench/tab-ref';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';

const SESSION = '0f5a8f0e-3f4a-4b4a-9c1e-0b8d1a2c3d4e' as ChatSessionKey;
const KEPT_ID = '6e000c5e-6679-44ef-a9f0-efee14f32310' as DiagramId;
const OTHER_ID = '9a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d' as DiagramId;

const DRAFT: CanvasSubject = {
	kind: 'draft',
	draft: { kind: 'draft', source: '<mxfile>one</mxfile>' }
};
const SAVED: CanvasSubject = { kind: 'saved', diagramId: OTHER_ID };

const kept: KeptStudioTab = { kind: 'kept', tab: diagramTab(KEPT_ID) };
const unkept: KeptStudioTab = { kind: 'unkept' };
const pending: KeptStudioTab = { kind: 'pending' };

const tabOf = (placement: ReturnType<typeof canvasPlacementOf>): TabId | undefined =>
	placement.kind === 'showing' ? placement.tab : undefined;

describe('Where a conversation’s canvas belongs', () => {
	it('waits while the kept-diagram lookup is still out', () => {
		expect(canvasPlacementOf(DRAFT, draftTab(SESSION), pending).kind).toBe('pending');
	});

	it('has nowhere to point when the conversation has drawn nothing', () => {
		expect(canvasPlacementOf(undefined, draftTab(SESSION), unkept).kind).toBe('none');
	});

	it('shows an unkept draft on the session’s own canvas', () => {
		expect(tabOf(canvasPlacementOf(DRAFT, draftTab(SESSION), unkept))).toBe(draftTab(SESSION));
	});

	// Keeping swaps the draft tab for the saved one while the transcript goes on
	// saying draft, so a kept draft is shown by the diagram it became.
	it('shows a kept draft as the diagram it became', () => {
		expect(tabOf(canvasPlacementOf(DRAFT, draftTab(SESSION), kept))).toBe(diagramTab(KEPT_ID));
	});

	// The defect this rule exists for: the kept diagram used to win over every
	// subject, so a version the agent had just written to another diagram was
	// routed to the kept diagram's tab — which held the version before it.
	it('shows a saved subject on its own diagram, not the kept one', () => {
		expect(tabOf(canvasPlacementOf(SAVED, diagramTab(OTHER_ID), kept))).toBe(diagramTab(OTHER_ID));
	});
});
