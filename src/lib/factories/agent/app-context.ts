import { workbench } from '$lib/factories/workbench/workbench';
import { AppContext, type AppContextController } from '$lib/controllers/agent/app-context';
import { AppContextState } from '$lib/stores/agent/app-context';
import { ChatContextPresentationService } from '$lib/services/chat/app-context';
import { BrowserChatContextEnvironment } from '$lib/client/agent/chat-context-environment';
import { workspaceSession } from '$lib/factories/workspace/session';
export const appContext: AppContextController = new AppContext(
	new AppContextState(),
	new BrowserChatContextEnvironment(workspaceSession, workbench),
	new ChatContextPresentationService()
);
