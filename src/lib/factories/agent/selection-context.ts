import {
	AgentSelectionContext,
	type AgentSelectionContextController
} from '$lib/controllers/agent/selection-context';
import { SelectionContextService } from '$lib/services/agent/selection-context';
import { NoteReadingStatisticsService } from '$lib/services/notes/reading-statistics';
export const agentSelectionContext: AgentSelectionContextController = new AgentSelectionContext(
	new SelectionContextService(),
	new NoteReadingStatisticsService()
);
