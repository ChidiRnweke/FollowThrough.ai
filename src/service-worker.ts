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
const PRECACHED_PATHS = [...build, ...files, ...prerendered];
const PRECACHED_PATH_SET = new Set(PRECACHED_PATHS);

const canStore = (response: Response): boolean =>
	response.ok && !response.headers.get('cache-control')?.includes('no-store');

const isPageDataRequest = (url: URL): boolean =>
	url.pathname.endsWith('/__data.json') || url.pathname.endsWith('.html__data.json');

const cacheRootShell = async (): Promise<void> => {
	try {
		const response = await fetch(APP_ROOT);
		if (canStore(response)) await (await caches.open(PAGE_CACHE)).put(APP_ROOT, response);
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

const cacheFirst = async (request: Request, pathname: string): Promise<Response> => {
	const cache = await caches.open(ASSET_CACHE);
	return (await cache.match(request)) ?? (await cache.match(pathname)) ?? fetch(request);
};

const networkFirst = async (
	request: Request,
	cacheKey: Request | string,
	fallback?: string
): Promise<Response> => {
	const cache = await caches.open(PAGE_CACHE);
	try {
		const response = await fetch(request);
		if (canStore(response)) await cache.put(cacheKey, response.clone());
		if (response.status < 500) return response;
		return (await cache.match(cacheKey)) ?? response;
	} catch (error) {
		const cached = await cache.match(cacheKey);
		if (cached) return cached;
		if (fallback) return Response.redirect(fallback, 302);
		throw error;
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
		event.respondWith(networkFirst(request, request));
	}
});
