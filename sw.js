var CACHE_PREFIX = "noten-pfoten-cache-";
var CACHE = CACHE_PREFIX + "3";
var precacheFiles = [
  "/",
  "/index.html",
  "/static/manifest.json",
  "/static/manifest-en.json",
  "/static/favicon.png"
];

self.addEventListener("install", function(evt) {
  evt.waitUntil(
    precache().then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function(evt) {
  evt.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(cacheNames.map(function(cacheName) {
        if (cacheName.indexOf(CACHE_PREFIX) === 0 && cacheName !== CACHE) {
          return caches.delete(cacheName);
        }
        return Promise.resolve(false);
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function(evt) {
  if (evt.request.method !== "GET") {
    return;
  }

  var requestUrl = new URL(evt.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  evt.respondWith(
    fromServer(evt.request).catch(function() {
      return fromCache(evt.request);
    })
  );
});

function precache() {
  return caches.open(CACHE).then(function(cache) {
    return cache.addAll(precacheFiles);
  });
}

function fromCache(request) {
  return caches.open(CACHE).then(function(cache) {
    return cache.match(request).then(function(matching) {
      return matching || Promise.reject("no-match");
    });
  });
}

function fromServer(request) {
  return fetch(request).then(function(response) {
    if (!response || !response.ok) {
      return response;
    }

    var responseForCache = response.clone();
    return caches.open(CACHE).then(function(cache) {
      return cache.put(request, responseForCache).catch(function() {
        // Some valid responses, such as partial audio files, cannot be cached.
      });
    }).catch(function() {
      // A cache failure must never prevent the app from using a valid response.
    }).then(function() {
      return response;
    });
  });
}
