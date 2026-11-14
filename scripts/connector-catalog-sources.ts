/**
 * The vendors in the connector catalog, reviewed by hand (ADR 0051).
 *
 * `scripts/record-connector-catalog.ts --record` turns this list into
 * `src/lib/models/connector-catalog/index.ts` and the logos in
 * `static/connector-logos/`. A vendor is listed only when it hosts its own MCP
 * server: either the official MCP Registry names it under the vendor's domain,
 * or the vendor's own documentation names the endpoint. The recorder checks
 * both, probes how the server signs in, and fails when the result differs from
 * `expect`, so an entry is never recorded on a guess.
 *
 * Descriptions are ours, one sentence each, never the vendor's marketing text.
 */

export type ConnectorCategory =
	| 'work'
	| 'documents'
	| 'engineering'
	| 'monitoring'
	| 'customers'
	| 'finance'
	| 'automation'
	| 'research';

export interface CatalogSource {
	/** The catalog id and the connector's slug: `[a-z][a-z0-9]{0,15}`, never changed once shipped. */
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly category: ConnectorCategory;
	readonly from:
		| {
				readonly kind: 'registry';
				/** The server's reverse-DNS name in the official MCP Registry. */
				readonly name: string;
		  }
		| {
				readonly kind: 'documented';
				readonly endpoint: string;
				/** A page on the vendor's own site that names the endpoint's host. */
				readonly documentation: string;
		  };
	/** The mark's name in SVG Logos (Iconify `logos:`), tried before the vendor's own icon. */
	readonly logo: string | undefined;
	/**
	 * An icon the vendor publishes, for a vendor whose site links none large
	 * enough for a tile. Tried after SVG Logos and before the registry and site.
	 */
	readonly icon?: string;
	/** How the server signs in, as the probe must find it. */
	readonly expect: 'discovered' | 'preregistered' | 'none';
}

const registry = (name: string) => ({ kind: 'registry', name }) as const;
const documented = (endpoint: string, documentation: string) =>
	({ kind: 'documented', endpoint, documentation }) as const;

export const CATALOG_SOURCES: readonly CatalogSource[] = [
	// Work and projects
	{
		id: 'linear',
		title: 'Linear',
		description: 'Find and update issues, projects and documents.',
		category: 'work',
		from: registry('app.linear/linear'),
		logo: 'linear-icon',
		expect: 'discovered'
	},
	{
		id: 'notion',
		title: 'Notion',
		description: 'Search, read and edit pages and databases.',
		category: 'work',
		from: registry('com.notion/mcp'),
		logo: 'notion-icon',
		expect: 'discovered'
	},
	{
		id: 'atlassian',
		title: 'Atlassian',
		description: 'Search and update Jira issues and Confluence pages.',
		category: 'work',
		from: registry('com.atlassian/atlassian-mcp-server'),
		logo: 'atlassian',
		expect: 'discovered'
	},
	{
		id: 'asana',
		title: 'Asana',
		description: 'Read and update tasks, projects and goals.',
		category: 'work',
		from: documented(
			'https://mcp.asana.com/v2/mcp',
			'https://developers.asana.com/docs/using-asanas-mcp-server'
		),
		logo: 'asana-icon',
		expect: 'preregistered'
	},
	{
		id: 'monday',
		title: 'monday.com',
		description: 'Work with boards, items and updates.',
		category: 'work',
		from: registry('com.monday/monday.com'),
		logo: 'monday-icon',
		expect: 'discovered'
	},
	{
		id: 'clickup',
		title: 'ClickUp',
		description: 'Find and update tasks, lists and docs.',
		category: 'work',
		from: documented(
			'https://mcp.clickup.com/mcp',
			'https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server'
		),
		logo: 'clickup-icon',
		expect: 'discovered'
	},
	{
		id: 'basecamp',
		title: 'Basecamp',
		description: 'Read and post to projects, to-dos and message boards.',
		category: 'work',
		from: registry('com.basecamp/mcp'),
		logo: 'basecamp-icon',
		expect: 'discovered'
	},
	{
		id: 'todoist',
		title: 'Todoist',
		description: 'Read and manage tasks and projects.',
		category: 'work',
		from: registry('net.todoist/mcp'),
		logo: 'todoist-icon',
		expect: 'discovered'
	},
	{
		id: 'airtable',
		title: 'Airtable',
		description: 'Read and update bases, tables and records.',
		category: 'work',
		from: registry('com.airtable/mcp'),
		logo: 'airtable',
		expect: 'discovered'
	},
	{
		id: 'productboard',
		title: 'Productboard',
		description: 'Look up features, insights and roadmaps.',
		category: 'work',
		from: registry('com.productboard/productboard'),
		logo: 'productboard-icon',
		expect: 'discovered'
	},
	{
		id: 'granola',
		title: 'Granola',
		description: 'Read your meeting notes and transcripts.',
		category: 'work',
		from: documented(
			'https://mcp.granola.ai/mcp',
			'https://docs.granola.ai/help-center/sharing/integrations/mcp'
		),
		logo: undefined,
		expect: 'discovered'
	},
	{
		id: 'fireflies',
		title: 'Fireflies',
		description: 'Search meeting transcripts and summaries.',
		category: 'work',
		from: registry('ai.fireflies/fireflies'),
		logo: undefined,
		expect: 'discovered'
	},
	{
		id: 'calendly',
		title: 'Calendly',
		description: 'Look up event types, bookings and availability.',
		category: 'work',
		from: documented(
			'https://mcp.calendly.com/',
			'https://developer.calendly.com/calendly-mcp-server'
		),
		logo: undefined,
		expect: 'discovered'
	},
	{
		id: 'slack',
		title: 'Slack',
		description: 'Search messages and post to channels.',
		category: 'work',
		from: documented('https://mcp.slack.com/mcp', 'https://docs.slack.dev/ai/mcp-server/'),
		logo: 'slack-icon',
		expect: 'preregistered'
	},
	// Documents and design
	{
		id: 'canva',
		title: 'Canva',
		description: 'Find, create and export designs.',
		category: 'documents',
		from: registry('com.canva.mcp/mcp'),
		logo: undefined,
		icon: 'https://static.canva.com/domain-assets/canva/static/images/apple-touch-180x180-1.png',
		expect: 'discovered'
	},
	{
		id: 'figma',
		title: 'Figma',
		description: 'Read design files, components and comments.',
		category: 'documents',
		from: registry('com.figma.mcp/mcp'),
		logo: 'figma',
		expect: 'discovered'
	},
	{
		id: 'mural',
		title: 'Mural',
		description: 'Read and add to murals and their stickies.',
		category: 'documents',
		from: registry('co.mural/mural'),
		logo: undefined,
		expect: 'discovered'
	},
	{
		id: 'whimsical',
		title: 'Whimsical',
		description: 'Create and read boards, docs and diagrams.',
		category: 'documents',
		from: registry('com.whimsical/mcp'),
		logo: undefined,
		expect: 'discovered'
	},
	{
		id: 'craft',
		title: 'Craft',
		description: 'Read and write documents and daily notes.',
		category: 'documents',
		from: registry('do.craft.mcp/server'),
		logo: undefined,
		expect: 'discovered'
	},
	{
		id: 'webflow',
		title: 'Webflow',
		description: 'Manage sites, pages and CMS collections.',
		category: 'documents',
		from: registry('com.webflow/mcp'),
		logo: 'webflow',
		expect: 'discovered'
	},
	{
		id: 'sanity',
		title: 'Sanity',
		description: 'Query and edit structured content.',
		category: 'documents',
		from: registry('io.sanity.www/mcp'),
		logo: 'sanity',
		expect: 'discovered'
	},
	{
		id: 'typeform',
		title: 'Typeform',
		description: 'Read forms and their responses.',
		category: 'documents',
		from: registry('com.typeform/typeform'),
		logo: undefined,
		icon: 'https://cdn.prod.website-files.com/66ffe2174aa8e8d5661c2708/68b6f00951eb33cd19b77288_Frame%201867174.png',
		expect: 'discovered'
	},
	{
		id: 'pandadoc',
		title: 'PandaDoc',
		description: 'Find documents, templates and their status.',
		category: 'documents',
		from: registry('com.pandadoc.mcp/mcp'),
		logo: undefined,
		expect: 'discovered'
	},
	{
		id: 'wordpress',
		title: 'WordPress.com',
		description: 'Read and publish posts and pages.',
		category: 'documents',
		from: documented(
			'https://public-api.wordpress.com/wpcom/v2/mcp/v1',
			'https://developer.wordpress.com/docs/mcp/'
		),
		logo: 'wordpress-icon',
		expect: 'discovered'
	},
	{
		id: 'dropbox',
		title: 'Dropbox',
		description: 'Search and read files and folders.',
		category: 'documents',
		from: documented(
			'https://mcp.dropbox.com/mcp',
			'https://help.dropbox.com/integrations/connect-dropbox-mcp-server'
		),
		logo: 'dropbox',
		expect: 'discovered'
	},
	{
		id: 'box',
		title: 'Box',
		description: 'Search and read files and folders.',
		category: 'documents',
		from: documented('https://mcp.box.com', 'https://developer.box.com/guides/box-mcp/remote/'),
		logo: 'box',
		expect: 'preregistered'
	},
	{
		id: 'egnyte',
		title: 'Egnyte',
		description: 'Search and read files in your Egnyte domain.',
		category: 'documents',
		from: registry('com.egnyte/mcp-server'),
		logo: undefined,
		expect: 'discovered'
	},
	// Engineering
	{
		id: 'github',
		title: 'GitHub',
		description: 'Work with repositories, issues and pull requests.',
		category: 'engineering',
		from: documented(
			'https://api.githubcopilot.com/mcp/',
			'https://github.com/github/github-mcp-server'
		),
		logo: 'github-icon',
		expect: 'preregistered'
	},
	{
		id: 'gitlab',
		title: 'GitLab',
		description: 'Work with projects, issues and merge requests.',
		category: 'engineering',
		from: registry('com.gitlab/mcp'),
		logo: 'gitlab-icon',
		expect: 'discovered'
	},
	{
		id: 'vercel',
		title: 'Vercel',
		description: 'Inspect projects, deployments and logs.',
		category: 'engineering',
		from: registry('com.vercel/vercel-mcp'),
		logo: 'vercel-icon',
		expect: 'discovered'
	},
	{
		id: 'netlify',
		title: 'Netlify',
		description: 'Inspect sites, deploys and forms.',
		category: 'engineering',
		from: documented(
			'https://netlify-mcp.netlify.app/mcp',
			'https://docs.netlify.com/build/build-with-ai/netlify-mcp-server/'
		),
		logo: 'netlify-icon',
		expect: 'discovered'
	},
	{
		id: 'cloudflare',
		title: 'Cloudflare Docs',
		description: 'Search the Cloudflare documentation.',
		category: 'engineering',
		from: registry('com.cloudflare.mcp/mcp'),
		logo: 'cloudflare-icon',
		expect: 'none'
	},
	{
		id: 'supabase',
		title: 'Supabase',
		description: 'Query projects, tables and logs.',
		category: 'engineering',
		from: registry('com.supabase/mcp'),
		logo: 'supabase-icon',
		expect: 'discovered'
	},
	{
		id: 'neon',
		title: 'Neon',
		description: 'Query Postgres projects, branches and tables.',
		category: 'engineering',
		from: documented('https://mcp.neon.tech/mcp', 'https://neon.com/docs/ai/neon-mcp-server'),
		logo: 'neon-icon',
		expect: 'discovered'
	},
	{
		id: 'prisma',
		title: 'Prisma',
		description: 'Manage Prisma Postgres databases and schemas.',
		category: 'engineering',
		from: registry('io.prisma/mcp'),
		logo: 'prisma',
		expect: 'discovered'
	},
	{
		id: 'circleci',
		title: 'CircleCI',
		description: 'Look up pipelines, failed jobs and flaky tests.',
		category: 'engineering',
		from: registry('com.circleci/mcp'),
		logo: 'circleci',
		expect: 'discovered'
	},
	{
		id: 'postman',
		title: 'Postman',
		description: 'Work with collections, environments and APIs.',
		category: 'engineering',
		from: registry('com.postman/postman-mcp-server'),
		logo: 'postman-icon',
		expect: 'discovered'
	},
	{
		id: 'huggingface',
		title: 'Hugging Face',
		description: 'Search models, datasets and Spaces.',
		category: 'engineering',
		from: registry('co.huggingface/hf-mcp-server'),
		logo: 'hugging-face-icon',
		expect: 'discovered'
	},
	{
		id: 'lovable',
		title: 'Lovable',
		description: 'Read and change your Lovable projects.',
		category: 'engineering',
		from: registry('dev.lovable/mcp'),
		logo: 'lovable-icon',
		expect: 'discovered'
	},
	{
		id: 'render',
		title: 'Render',
		description: 'Inspect services, deploys and logs.',
		category: 'engineering',
		from: documented('https://mcp.render.com/mcp', 'https://render.com/docs/mcp-server'),
		logo: undefined,
		expect: 'preregistered'
	},
	{
		id: 'jam',
		title: 'Jam',
		description: 'Read bug reports with their console and network logs.',
		category: 'engineering',
		from: registry('dev.jam/jam'),
		logo: undefined,
		expect: 'discovered'
	},
	// Monitoring and analytics
	{
		id: 'sentry',
		title: 'Sentry',
		description: 'Look up errors, issues and releases.',
		category: 'monitoring',
		from: documented('https://mcp.sentry.dev/mcp', 'https://docs.sentry.io/product/sentry-mcp/'),
		logo: 'sentry-icon',
		expect: 'discovered'
	},
	{
		id: 'posthog',
		title: 'PostHog',
		description: 'Query product analytics, flags and experiments.',
		category: 'monitoring',
		from: documented(
			'https://mcp.posthog.com/mcp',
			'https://posthog.com/docs/model-context-protocol'
		),
		logo: 'posthog-icon',
		expect: 'discovered'
	},
	{
		id: 'amplitude',
		title: 'Amplitude',
		description: 'Query charts, dashboards and experiments.',
		category: 'monitoring',
		from: registry('com.amplitude/mcp-server'),
		logo: 'amplitude-icon',
		expect: 'discovered'
	},
	{
		id: 'honeycomb',
		title: 'Honeycomb',
		description: 'Query traces, SLOs and triggers.',
		category: 'monitoring',
		from: registry('io.honeycomb/mcp'),
		logo: undefined,
		icon: 'https://github.com/honeycombio.png',
		expect: 'discovered'
	},
	{
		id: 'pagerduty',
		title: 'PagerDuty',
		description: 'Look up incidents, services and on-call schedules.',
		category: 'monitoring',
		from: documented(
			'https://mcp.pagerduty.com/mcp',
			'https://support.pagerduty.com/main/docs/pagerduty-mcp-server-integration-guide'
		),
		logo: 'pagerduty-icon',
		expect: 'preregistered'
	},
	// Sales and support
	{
		id: 'hubspot',
		title: 'HubSpot',
		description: 'Read and update contacts, companies and deals.',
		category: 'customers',
		from: documented('https://mcp.hubspot.com/', 'https://developers.hubspot.com/mcp'),
		logo: 'hubspot',
		expect: 'preregistered'
	},
	{
		id: 'intercom',
		title: 'Intercom',
		description: 'Search conversations and contacts.',
		category: 'customers',
		from: documented(
			'https://mcp.intercom.com/mcp',
			'https://developers.intercom.com/docs/guides/mcp'
		),
		logo: 'intercom-icon',
		expect: 'discovered'
	},
	{
		id: 'close',
		title: 'Close',
		description: 'Read and update leads, opportunities and activities.',
		category: 'customers',
		from: registry('com.close/close-mcp'),
		logo: undefined,
		icon: 'https://www.close.com/apple-touch-icon.png',
		expect: 'discovered'
	},
	{
		id: 'attio',
		title: 'Attio',
		description: 'Read and update records, lists and notes.',
		category: 'customers',
		from: documented('https://mcp.attio.com/mcp', 'https://docs.attio.com/mcp/overview'),
		logo: undefined,
		icon: 'https://github.com/attio.png',
		expect: 'discovered'
	},
	// Payments and finance
	{
		id: 'stripe',
		title: 'Stripe',
		description: 'Look up customers, payments and subscriptions.',
		category: 'finance',
		from: registry('com.stripe/mcp'),
		logo: 'stripe',
		expect: 'discovered'
	},
	{
		id: 'paypal',
		title: 'PayPal',
		description: 'Look up invoices, orders and transactions.',
		category: 'finance',
		from: registry('com.paypal.mcp/mcp'),
		logo: 'paypal',
		expect: 'discovered'
	},
	{
		id: 'square',
		title: 'Square',
		description: 'Look up payments, orders and catalog items.',
		category: 'finance',
		from: documented('https://mcp.squareup.com/mcp', 'https://developer.squareup.com/docs/mcp'),
		logo: 'square',
		expect: 'discovered'
	},
	// Automation
	{
		id: 'zapier',
		title: 'Zapier',
		description: 'Run actions across the apps your Zaps connect.',
		category: 'automation',
		from: registry('com.zapier/mcp'),
		logo: 'zapier',
		icon: 'https://github.com/zapier.png',
		expect: 'discovered'
	},
	{
		id: 'make',
		title: 'Make',
		description: 'Run your Make scenarios as tools.',
		category: 'automation',
		from: registry('com.make/mcp-server'),
		logo: undefined,
		expect: 'discovered'
	},
	{
		id: 'apify',
		title: 'Apify',
		description: 'Run Actors that scrape and extract web data.',
		category: 'automation',
		from: registry('com.apify/apify-mcp-server'),
		logo: 'apify-icon',
		expect: 'discovered'
	},
	// Search and research
	{
		id: 'exa',
		title: 'Exa',
		description: 'Search the web and read the pages it finds.',
		category: 'research',
		from: registry('ai.exa/exa'),
		logo: 'exa-icon',
		expect: 'none'
	},
	{
		id: 'microsoftlearn',
		title: 'Microsoft Learn',
		description: 'Search Microsoft’s official documentation.',
		category: 'research',
		from: registry('com.microsoft/microsoft-learn-mcp'),
		logo: 'microsoft-icon',
		expect: 'none'
	},
	{
		id: 'raindrop',
		title: 'Raindrop.io',
		description: 'Search and save bookmarks and highlights.',
		category: 'research',
		from: registry('io.raindrop/mcp'),
		logo: undefined,
		expect: 'discovered'
	},
	{
		id: 'ahrefs',
		title: 'Ahrefs',
		description: 'Look up backlinks, keywords and site metrics.',
		category: 'research',
		from: registry('com.ahrefs/mcp'),
		logo: undefined,
		expect: 'discovered'
	}
];
