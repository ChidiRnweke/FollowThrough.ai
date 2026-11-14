import { tracedService } from '$lib/server/infrastructure/telemetry/service-boundary';
import type { CatalogConnectorId } from '$lib/models/connectors';
import type { ActorContext } from '$lib/models/identity';
import type { AtomicOperation, DateTime } from '$lib/models/workspace';
import type { HarnessConnectors } from '$lib/server/controllers/agent/controller';
import type { ConnectorsDependencies } from '$lib/server/controllers/connectors/controller';
import type { Database } from '$lib/server/db';
import type { SecretSealing } from '$lib/server/infrastructure/crypto/secret-box';
import type { FetchLike } from '$lib/server/infrastructure/network/outbound';
import {
	ConnectorAuthorizationRecords,
	ConnectorRecords
} from '$lib/server/repositories/connectors/postgres/connectors';
import type { ConnectorToolEmbedding } from '$lib/server/services/agent/tools/tool-search';
import {
	ConnectorAuthorization,
	type ClientCredentials
} from '$lib/server/services/connectors/authorization';
import { ConnectorDirectory } from '$lib/server/services/connectors/directory';
import { ConnectorIcons } from '$lib/server/services/connectors/icons';
import { ConnectorServers } from '$lib/server/services/connectors/servers';
import { ConnectorToolPolicyRules } from '$lib/services/connectors/policy';

/** What the deployment provides for connectors (ADR 0049). */
export type ConnectorConfiguration =
	/** No CONNECTOR_SECRET_KEYS: no credential can be stored, so connectors are off. */
	| { readonly kind: 'unconfigured' }
	| {
			readonly kind: 'configured';
			readonly secrets: SecretSealing;
			/** The public origin OAuth redirects return to. */
			readonly origin: string;
			readonly preregistered: ReadonlyMap<CatalogConnectorId, ClientCredentials>;
			/** The guarded way out; every connector request uses it. */
			readonly fetch: FetchLike;
	  };

export interface ConnectorsCapabilityInput {
	readonly db: Database;
	readonly transactionRunner: AtomicOperation;
	readonly now: () => DateTime;
	readonly configuration: ConnectorConfiguration;
	readonly embeddings: ConnectorToolEmbedding;
}

export interface ConnectorsCapability {
	readonly controller: ConnectorsDependencies;
	/** What the agent harness reads to offer connector tools. */
	readonly harness: HarnessConnectors;
}

export const createConnectorsCapability = (
	actor: ActorContext,
	input: ConnectorsCapabilityInput
): ConnectorsCapability => {
	const policy = new ConnectorToolPolicyRules();
	const configuration = input.configuration;
	if (configuration.kind === 'unconfigured')
		return { controller: { policy, setup: { kind: 'unconfigured' } }, harness: { kind: 'off' } };
	const directory = tracedService(
		'ConnectorDirectory',
		new ConnectorDirectory({
			connectors: new ConnectorRecords(actor, input.db, configuration.secrets),
			authorizations: new ConnectorAuthorizationRecords(actor, input.db, configuration.secrets),
			now: input.now
		})
	);
	return {
		controller: {
			policy,
			setup: {
				kind: 'configured',
				registry: directory,
				attempts: directory,
				authorizer: tracedService(
					'ConnectorAuthorization',
					new ConnectorAuthorization({
						fetch: configuration.fetch,
						origin: configuration.origin,
						preregistered: configuration.preregistered,
						now: input.now
					})
				),
				servers: tracedService('ConnectorServers', new ConnectorServers(configuration.fetch)),
				icons: tracedService('ConnectorIcons', new ConnectorIcons(configuration.fetch)),
				embeddings: input.embeddings,
				preregistered: new Set(configuration.preregistered.keys()),
				transactionRunner: input.transactionRunner,
				now: input.now
			}
		},
		harness: { kind: 'on', source: directory, policy }
	};
};
