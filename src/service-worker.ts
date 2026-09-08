/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { base, build, files, prerendered, version } from '$service-worker';

const worker: ServiceWorkerGlobalScope = self;
const CACHE_PREFIX = 'followthrough-';
const ASSET_CACHE = `${CACHE_PREFIX}assets-${version}`;
const APP_ROOT = `${base}/`;
const OFFLINE_ROUTE = `${base}/offline`;
const OFFLINE_SHELL = `${base}/offline-shell.html`;
const BUILD_PATHS = [...build, ...files, ...prerendered, OFFLINE_SHELL];
/**
 * Harper's proofreading engine is a ~16 MB WebAssembly binary, and proofreading
 * is off until a user asks for it. Installing it with the app would make every
 * install — including every version bump — pay for a checker most people never
 * switch on, and `cache.addAll` is atomic, so a failure on that one download
 * would take the whole precache down with it. It is served cache-first like any
 * other asset and stored the first time it is actually fetched.
 */
const isOnDemandAsset = (path: string): boolean => path.endsWith('.wasm');
const PRECACHED_PATHS = BUILD_PATHS.filter((path) => !isOnDemandAsset(path));
const PRECACHED_PATH_SET = new Set(BUILD_PATHS);

const canStore = (response: Response): boolean =>
	response.ok && !response.headers.get('cache-control')?.includes('no-store');

// Storing is best-effort: a quota or an uncacheable response must not fail a
// request whose fetch already succeeded.
const store = async (cache: Cache, key: Request | string, response: Response): Promise<void> => {
	try {
		await cache.put(key, response.clone());
		// audit-allow: silent-catch — cache quota failure cannot invalidate the already-received network response
	} catch {
		// Nothing to recover: the response still goes to the page.
	}
};

worker.addEventListener('install', (event) => {
	event.waitUntil(caches.open(ASSET_CACHE).then((cache) => cache.addAll(PRECACHED_PATHS)));
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		Promise.all([
			caches
				.keys()
				.then((keys) =>
					Promise.all(
						keys
							.filter((key) => key.startsWith(CACHE_PREFIX) && key !== ASSET_CACHE)
							.map((key) => caches.delete(key))
					)
				),
			worker.clients.claim()
		])
	);
});

/**
 * Once `respondWith` is called the worker owns the outcome: a rejected promise
 * reaches the page as `TypeError: Failed to fetch`, which SvelteKit cannot tell
 * apart from the network being gone and answers with a full-page reload. Every
 * failure below therefore resolves to a response the caller can read a status
 * from.
 */
const unavailable = (): Response =>
	// chisel-ignore error-flow:raw-http-status -- A service worker must construct the protocol-level offline response directly.
	new Response('Offline', { status: 503, statusText: 'Offline' });

const cacheFirst = async (request: Request, pathname: string): Promise<Response> => {
	const cache = await caches.open(ASSET_CACHE);
	const cached = (await cache.match(request)) ?? (await cache.match(pathname));
	if (cached) return cached;
	try {
		const response = await fetch(request);
		// Assets held back from the install precache are stored the first time they
		// are used, so switching proofreading on once makes it work offline after.
		if (isOnDemandAsset(pathname) && canStore(response)) await store(cache, pathname, response);
		return response;
		// audit-allow: silent-catch — the offline path returns cached content only when present, otherwise an explicit redirect or 503.
	} catch {
		return unavailable();
	}
};

const isWorkspaceNavigation = (pathname: string): boolean =>
	/^\/(today|notes|todos|projects|skills|chats|diagrams|artifacts|trash|profile|settings)(?:\/|$)/.test(
		pathname.slice(base.length)
	);

const navigation = async (request: Request, pathname: string): Promise<Response> => {
	try {
		const response = await fetch(request);
		if (response.status < 500) return response;
		// A cached shell can still open local resources while the app server is unavailable.
		// audit-allow: silent-catch — an unavailable navigation resolves to the data-free shell or the explicit offline page.
	} catch {
		return fallbackNavigation(pathname);
	}
	return fallbackNavigation(pathname);
};
const fallbackNavigation = async (pathname: string): Promise<Response> => {
	if (pathname === APP_ROOT)
		return Response.redirect(`${worker.location.origin}${base}/today`, 302);
	if (isWorkspaceNavigation(pathname)) {
		const shell = await (await caches.open(ASSET_CACHE)).match(OFFLINE_SHELL);
		return shell ?? unavailable();
	}
	return Response.redirect(`${worker.location.origin}${OFFLINE_ROUTE}`, 302);
};

worker.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== worker.location.origin) return;

	if (PRECACHED_PATH_SET.has(url.pathname)) {
		event.respondWith(cacheFirst(request, url.pathname));
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(navigation(request, url.pathname));
		return;
	}
});
