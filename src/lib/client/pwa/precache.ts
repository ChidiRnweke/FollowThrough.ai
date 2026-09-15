/** Installation must bind every asset, including stable shell URLs, to this release. */
export const precacheRequests = (paths: readonly string[]): Request[] =>
	paths.map((path) => new Request(path, { cache: 'reload' }));
