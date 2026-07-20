import type { WorkspaceFixture } from '../../lab/workspace';

/**
 * Source material for diagram cases: an explicit component-and-direction
 * description, so a generated diagram can be checked for faithfulness rather
 * than merely for being valid Mermaid. The relationships are stated one per
 * sentence and directionally, which gives the judge something unambiguous to
 * grade against.
 */
export const architectureWorkspace: WorkspaceFixture = {
	projects: [
		{
			name: 'Checkout',
			notes: [
				{
					title: 'Checkout architecture',
					body: [
						'The checkout system has five components: the Storefront, the Checkout API, the Payment Gateway, the Ledger Service, and the Notification Worker.',
						'The Storefront sends a cart submission to the Checkout API over HTTPS.',
						'The Checkout API calls the Payment Gateway to authorise the card, and waits for the authorisation result.',
						'Once authorisation succeeds, the Checkout API writes a balanced double-entry posting to the Ledger Service.',
						'The Checkout API then publishes an order-confirmed event, which the Notification Worker consumes to send the customer an email.',
						'The Notification Worker never calls the Payment Gateway directly.'
					].join('\n\n')
				}
			]
		}
	]
};
