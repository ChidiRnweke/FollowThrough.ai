import type { RunAgentInput } from '$lib/models/agent';
import type { ProvenanceId } from '$lib/models/provenance';
export interface AgentToolContext {
	readonly provenanceId: ProvenanceId;
	readonly model: string;
	readonly input: RunAgentInput;
}
export interface McpToolContext {
	readonly provenanceId: ProvenanceId;
}
export interface ToolAccessPolicy {
	isEnabled(toolName: string): boolean;
}

import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { NoteId } from '$lib/models/notes';
import type { z } from 'zod';
export interface AgentSkillContext {
	readonly provenanceId: ProvenanceId;
	readonly contextNoteId?: NoteId;
}
export interface ToolResultReader {
	json<Result>(result: Result): z.core.util.JSONType;
	read<Result>(result: Result): AgentPayload;
	arguments<Input>(input: Input): AgentPayloadObject;
}
