import type {
	ConnectorToolHints,
	ConnectorToolPolicy,
	ConnectorToolPolicyChoice
} from '$lib/models/connectors';

export interface ConnectorToolPolicyRule {
	/** What a connector tool does when the agent calls it: run, ask first, or not exist. */
	effective(policy: ConnectorToolPolicy, hints: ConnectorToolHints): ConnectorToolPolicyChoice;
}

/**
 * A tool the server marks read-only runs without asking; every other tool asks.
 * The default trusts every server's hints, custom servers included, because the
 * user chose to connect the server (ADR 0049). A user's choice always wins.
 */
export class ConnectorToolPolicyRules implements ConnectorToolPolicyRule {
	effective(policy: ConnectorToolPolicy, hints: ConnectorToolHints): ConnectorToolPolicyChoice {
		if (policy.kind === 'chosen') return policy.choice;
		return hints.readOnly ? 'allow' : 'ask';
	}
}
