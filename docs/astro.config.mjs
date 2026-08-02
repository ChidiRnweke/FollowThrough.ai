import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

export default defineConfig({
	site: 'https://chidirnweke.github.io',
	base: '/FollowThrough.ai/',
	integrations: [
		starlight({
			title: 'FollowThrough.ai',
			description: 'Documentation for the FollowThrough.ai application and its internal API.',
			favicon: '/favicon.svg',
			head: [
				{
					tag: 'link',
					attrs: { rel: 'icon', type: 'image/x-icon', href: '/FollowThrough.ai/favicon.ico' }
				}
			],
			logo: {
				light: './src/assets/followthrough-mark-light.svg',
				dark: './src/assets/followthrough-mark-dark.svg',
				alt: 'FollowThrough'
			},
			customCss: ['./src/styles/theme.css'],
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/ChidiRnweke/FollowThrough.ai'
				}
			],
			components: {
				SocialIcons: './src/components/nav-extras.astro'
			},
			expressiveCode: {
				styleOverrides: {
					borderRadius: '0.5rem',
					borderColor: 'var(--sl-color-hairline)',
					borderWidth: '1px'
				}
			},
			editLink: {
				baseUrl: 'https://github.com/ChidiRnweke/FollowThrough.ai/edit/master/docs'
			},
			sidebar: [
				{
					label: 'User documentation',
					items: [
						{ label: 'Getting started', link: '/getting-started/' },
						{
							label: 'Agents propose, users accept',
							link: '/explanation/agents-propose-users-accept/'
						}
					]
				},
				{
					label: 'Developer documentation',
					items: [
						{ label: 'Self-hosting', link: '/self-hosting/' },
						{
							label: 'How-to guides',
							collapsed: true,
							items: [{ autogenerate: { directory: 'guides' } }]
						},
						typeDocSidebarGroup,
						{ label: 'Architecture', link: '/explanation/architecture/' }
					]
				}
			],
			plugins: [
				starlightTypeDoc({
					entryPoints: [
						'../src/lib/server/controllers/**/controller.ts',
						'../src/lib/server/services/**/contracts.ts',
						'../src/lib/server/services/**/catalog.ts',
						'../src/lib/server/**/*-factory.ts'
					],
					tsconfig: './tsconfig.typedoc.json',
					output: 'reference',
					sidebar: { label: 'API Reference', collapsed: true },
					typeDoc: {
						exclude: ['**/*.spec.ts', '**/*.test.ts'],
						skipErrorChecking: true,
						/* Pin source links to the branch that exists on origin; the default
						   (local HEAD SHA) 404s whenever commits are not pushed yet. */
						gitRevision: 'master',
						excludeNotDocumented: true,
						excludeNotDocumentedKinds: [
							'Class',
							'Interface',
							'Method',
							'Property',
							'Function',
							'Variable',
							'Accessor',
							'Constructor',
							'TypeAlias',
							'Enum',
							'EnumMember',
							'Reference'
						]
					}
				})
			]
		})
	]
});
