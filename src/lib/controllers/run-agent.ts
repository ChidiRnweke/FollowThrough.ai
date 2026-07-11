import type { ActorContext, AgentEvent, RunAgentInput } from '../models';
import type { AgentContextBuilder, AgentRunner } from '../services';
export interface RunAgentDependencies {
	contextBuilder: AgentContextBuilder;
	agentRunner: AgentRunner;
}
export class DefaultRunAgentController {
	constructor(private readonly dependencies: RunAgentDependencies) {}
	async *execute(actor: ActorContext, input: RunAgentInput): AsyncIterable<AgentEvent> {
		const context = await this.dependencies.contextBuilder.build(actor, input);
		yield* this.dependencies.agentRunner.run(actor, input, context);
	}
}
