const CACHE_NAME = "ai-builder-smart-ready-v1";

const APP_SHELL = [
    "./",
    "./index.html",
    "./project2.html",
    "./project3.html",
    "./privacy.html",
    "./manifest.webmanifest",
    "./icons/app-icon.svg",
    "./icons/app-icon-maskable.svg",
    "./css/style.css",
    "./css/project2.css",
    "./css/project3.css",
    "./css/privacy.css",
    "./js/app.js",
    "./js/project2.js",
    "./js/project3.js",
    "./js/pwa.js"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key.startsWith("ai-builder-smart-ready-") && key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    if (url.origin !== self.location.origin) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                    return response;
                })
                .catch(async () => {
                    return (await caches.match(request)) ||
                        (await caches.match("./index.html"));
                })
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => {
            const network = fetch(request)
                .then(response => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached);

            return cached || network;
        })
    );
});
