import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { ApiTokensController } from '$lib/server/controllers/api-tokens/controller';
import type { AttachmentsController } from '$lib/server/controllers/attachments/controller';
import type { AgentToolOutput } from '../tool-outputs';
interface AccountToolOperationsDependencies {
	apiTokens(): Pick<ApiTokensController, 'list' | 'revoke'>;
	attachments(): Pick<AttachmentsController, 'list'>;
}
export interface AccountToolOperations {
	list_api_tokens(): Promise<AgentToolOutput<'list_api_tokens'>>;
	revoke_api_token(
		input: AgentToolInput<'revoke_api_token'>
	): Promise<AgentToolOutput<'revoke_api_token'>>;
	list_attachments(
		input: AgentToolInput<'list_attachments'>
	): Promise<AgentToolOutput<'list_attachments'>>;
}
export class AccountToolOperationsController implements AccountToolOperations {
	constructor(
		private readonly controllers: AccountToolOperationsDependencies,
		private readonly actor: ActorContext
	) {}
	async list_api_tokens(): Promise<AgentToolOutput<'list_api_tokens'>> {
		return this.controllers.apiTokens().list(this.actor);
	}
	async revoke_api_token(
		input: AgentToolInput<'revoke_api_token'>
	): Promise<AgentToolOutput<'revoke_api_token'>> {
		const token = await this.controllers.apiTokens().revoke(this.actor, input.tokenId);
		return { tokenId: token.id, name: token.name, revoked: true as const };
	}
	async list_attachments(
		input: AgentToolInput<'list_attachments'>
	): Promise<AgentToolOutput<'list_attachments'>> {
		return this.controllers.attachments().list(this.actor, input.noteId as NoteId);
	}
}
