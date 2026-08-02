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
			logo: {
				light: './src/assets/followthrough-mark-light.svg',
				dark: './src/assets/followthrough-mark-dark.svg',
				alt: 'FollowThrough'
			},
			customCss: ['./src/styles/theme.css'],
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
				{ label: 'Getting Started', items: [{ autogenerate: { directory: 'getting-started' } }] },
				{ label: 'How-to Guides', items: [{ autogenerate: { directory: 'guides' } }] },
				typeDocSidebarGroup,
				{ label: 'Explanation', items: [{ autogenerate: { directory: 'explanation' } }] }
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
