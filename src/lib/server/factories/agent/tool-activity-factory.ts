import type { ToolActivityProjection } from '$lib/models/agent';
import { ToolActivityProjectionService } from '$lib/server/services/agent/conversations/tool-activity';

export const createToolActivityProjection = (): ToolActivityProjection =>
	new ToolActivityProjectionService();
