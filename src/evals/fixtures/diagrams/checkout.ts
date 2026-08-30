import { architectureWorkspace } from '../workspaces/architecture';
import type { DiagramFixture } from './fixture';

/**
 * The existing checkout architecture, given expectations.
 *
 * `iconBearing` is deliberately empty: nothing in this system is a branded
 * product, so there is no logo for a "Ledger Service" and demanding one would
 * fail a correct diagram. It is the case that shows the icon check is declared
 * per architecture rather than assumed of all of them.
 */
export const checkoutArchitecture: DiagramFixture = {
	noteTitle: 'Checkout architecture',
	workspace: architectureWorkspace,
	expectations: {
		components: [
			'Storefront',
			'Checkout API',
			'Payment Gateway',
			'Ledger Service',
			'Notification Worker'
		],
		edges: [
			{ from: 'Storefront', to: 'Checkout API' },
			{ from: 'Checkout API', to: 'Payment Gateway' },
			{ from: 'Checkout API', to: 'Ledger Service' },
			{ from: 'Checkout API', to: 'Notification Worker' }
		],
		connections: [],
		forbiddenEdges: [{ from: 'Notification Worker', to: 'Payment Gateway' }],
		iconBearing: [],
		groups: []
	}
};
