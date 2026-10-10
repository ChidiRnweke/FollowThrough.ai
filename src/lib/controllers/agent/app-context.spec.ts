import { expect, it } from 'vitest';
import { AppContext } from './app-context';
import { AppContextState } from '$lib/stores/agent/app-context';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import type { ChatContextEnvironment } from './app-context';
import type { ChatContextPresentation } from '$lib/services/chat/app-context';
it('keeps a replacement chat pane registration when an older pane unmounts', () => {
	const state = new AppContextState();
	const context = new AppContext(
		state,
		capabilityDependencies<ChatContextEnvironment>({}),
		capabilityDependencies<ChatContextPresentation>({})
	);
	const release = context.registerChatPane('session', () => ({ title: 'Old' }));
	context.registerChatPane('session', () => ({ title: 'New' }));
	release();
	expect(state.chatPanes.get('session')?.().title).toBe('New');
});
