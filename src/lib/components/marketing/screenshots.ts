/**
 * Every product screenshot, by id. The images live once, in `static/product-screenshots/`, as
 * `<id>-light.jpg` and `<id>-dark.jpg`. The README links to them by path, the docs site imports
 * them, and this page serves them from the app's own static root.
 *
 * `pnpm docs:screenshots` regenerates all of them from a seeded workspace. Its scene table is
 * keyed by this list, so an id cannot be added here without a way to capture it.
 */
export const screenshotIds = [
	'today-screen',
	'todo-board',
	'note-view',
	'project-context',
	'skill-support',
	'tools',
	'mcp-settings',
	'open-model-access',
	'diagram-render',
	'in-editor-ai',
	'in-editor-chat',
	'agent-tab',
	'agent-activity',
	'agent-connections',
	'connections-ask'
] as const;

export type ScreenshotId = (typeof screenshotIds)[number];

export type ScreenshotTheme = 'light' | 'dark';

export const screenshotThemes: readonly ScreenshotTheme[] = ['light', 'dark'];

export const screenshotFile = (id: ScreenshotId, theme: ScreenshotTheme): string =>
	`${id}-${theme}.jpg`;

export const screenshotUrl = (id: ScreenshotId, theme: ScreenshotTheme): string =>
	`/product-screenshots/${screenshotFile(id, theme)}`;
