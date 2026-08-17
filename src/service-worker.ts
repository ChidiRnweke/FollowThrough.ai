/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { base, build, files, prerendered, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE_PREFIX = 'followthrough-';
const ASSET_CACHE = `${CACHE_PREFIX}assets-${version}`;
const PAGE_CACHE = `${CACHE_PREFIX}pages-${version}`;
const APP_ROOT = `${base}/`;
const OFFLINE_ROUTE = `${base}/offline`;
const BUILD_PATHS = [...build, ...files, ...prerendered];
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

const canStore = (response: Response, allowPrivatePageData = false): boolean =>
	response.ok &&
	(allowPrivatePageData || !response.headers.get('cache-control')?.includes('no-store'));

const isPageDataRequest = (url: URL): boolean =>
	url.pathname.endsWith('/__data.json') || url.pathname.endsWith('.html__data.json');

// Storing is best-effort: a quota or an uncacheable response must not fail a
// request whose fetch already succeeded.
const store = async (cache: Cache, key: Request | string, response: Response): Promise<void> => {
	try {
		await cache.put(key, response.clone());
	} catch {
		// Nothing to recover: the response still goes to the page.
	}
};

const cacheRootShell = async (): Promise<void> => {
	try {
		const response = await fetch(APP_ROOT);
		if (canStore(response)) await store(await caches.open(PAGE_CACHE), APP_ROOT, response);
	} catch {
		// The generated app remains installable even if the dynamic shell is briefly unavailable.
	}
};

worker.addEventListener('install', (event) => {
	event.waitUntil(
		Promise.all([
			caches.open(ASSET_CACHE).then((cache) => cache.addAll(PRECACHED_PATHS)),
			cacheRootShell()
		])
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		Promise.all([
			caches
				.keys()
				.then((keys) =>
					Promise.all(
						keys
							.filter(
								(key) => key.startsWith(CACHE_PREFIX) && key !== ASSET_CACHE && key !== PAGE_CACHE
							)
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
	} catch {
		return unavailable();
	}
};

const networkFirst = async (
	request: Request,
	cacheKey: Request | string,
	fallback?: string,
	allowPrivatePageData = false
): Promise<Response> => {
	const cache = await caches.open(PAGE_CACHE);
	try {
		const response = await fetch(request);
		if (canStore(response, allowPrivatePageData)) await store(cache, cacheKey, response);
		if (response.status < 500) return response;
		return (await cache.match(cacheKey)) ?? response;
	} catch {
		const cached = await cache.match(cacheKey);
		if (cached) return cached;
		return fallback ? Response.redirect(fallback, 302) : unavailable();
	}
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
		event.respondWith(networkFirst(request, request, OFFLINE_ROUTE));
		return;
	}

	if (isPageDataRequest(url)) {
		// SvelteKit marks page-data responses private/no-store. This app-owned cache is the narrow
		// exception that allows an already-visited private workspace route to reopen offline.
		event.respondWith(networkFirst(request, request, undefined, true));
	}
});
