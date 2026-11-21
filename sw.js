// Service worker de /vtc-template/, généré au build (spec 5.11). Version du build : 20261121104948.
const VERSION = "20261121104948";
const BASE = "/vtc-template/";
const PREFIX = "vtc-template-";
const CACHES = {"page":"vtc-template-pages-20261121104948","asset":"vtc-template-assets-20261121104948","image":"vtc-template-images-20261121104948"};
const OFFLINE_PAGES = ["/vtc-template/fr/hors-connexion/","/vtc-template/en/hors-connexion/"];
const cacheKind = function cacheKind(request, origin, base) {
	if (request.method !== "GET") return null;
	let target;
	try {
		target = new URL(request.url);
	} catch {
		return null;
	}
	const root = base.endsWith("/") ? base : `${base}/`;
	if (target.origin !== origin || !target.pathname.startsWith(root)) return null;
	if (request.mode === "navigate") return "page";
	if (request.destination === "image" || /\.(?:png|jpe?g|webp|avif|gif|svg|ico)$/i.test(target.pathname)) return "image";
	if (target.pathname.startsWith(`${root}_astro/`)) return "asset";
	return null;
};
const offlinePath = function offlinePath(pathname, base) {
	const root = base.endsWith("/") ? base : `${base}/`;
	return pathname.startsWith(`${root}en/`) ? `${root}en/hors-connexion/` : `${root}fr/hors-connexion/`;
};
const assetUrls = function assetUrls(html, base) {
	const root = base.endsWith("/") ? base : `${base}/`;
	const found = [];
	for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
		const value = match[1];
		if (value.startsWith(`${root}_astro/`) && !found.includes(value)) found.push(value);
	}
	return found;
};
const staleCaches = function staleCaches(names, version, prefix = CACHE_PREFIX) {
	return names.filter((name) => name.startsWith(prefix) && !name.endsWith(`-${version}`));
};

const stamp = (response) => response && response.ok && !response.redirected;

async function store(name, request, response) {
  if (!stamp(response)) return;
  const cache = await caches.open(name);
  await cache.put(request, response);
}

// Fichier du build ou image cité par une page : gardé s'il ne l'est pas déjà.
async function warmOne(url) {
  const href = new URL(url, self.location.origin).href;
  const kind = cacheKind({ method: 'GET', url: href, mode: 'no-cors', destination: '' }, self.location.origin, BASE);
  if (kind !== 'asset' && kind !== 'image') return;
  const cache = await caches.open(CACHES[kind]);
  if (await cache.match(href)) return;
  try {
    await store(CACHES[kind], href, await fetch(href));
  } catch (error) {
    // Hors connexion : tant pis, il sera gardé à la prochaine visite.
  }
}

// Pages « hors connexion » FR et EN, et leurs styles et scripts, gardées dès l'installation.
async function precache() {
  for (const path of OFFLINE_PAGES) {
    try {
      const response = await fetch(path, { cache: 'reload' });
      if (!stamp(response)) continue;
      const html = await response.clone().text();
      await store(CACHES.page, path, response);
      await Promise.all(assetUrls(html, BASE).map(warmOne));
    } catch (error) {
      // Réseau coupé pendant l'installation : la réponse de secours minimale prendra le relais.
    }
  }
}

self.addEventListener('install', (event) => {
  // skipWaiting ici : appelé à l'activation, il n'aurait plus d'effet.
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(staleCaches(keys, VERSION, PREFIX).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const FALLBACK = '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hors connexion</title><p style="font:16px/1.5 system-ui,sans-serif;padding:24px">Hors connexion. Offline.</p></html>';

async function networkFirst(event, request) {
  try {
    const response = await fetch(request);
    if (stamp(response)) event.waitUntil(store(CACHES.page, request, response.clone()));
    return response;
  } catch (error) {
    const cache = await caches.open(CACHES.page);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const offline = await cache.match(offlinePath(new URL(request.url).pathname, BASE));
    return offline || new Response(FALLBACK, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function cacheFirst(event, request) {
  const cache = await caches.open(CACHES.asset);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (stamp(response)) event.waitUntil(cache.put(request, response.clone()));
  return response;
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(CACHES.image);
  const cached = await cache.match(request);
  const refresh = fetch(request).then((response) => (stamp(response) ? cache.put(request, response.clone()).then(() => response) : response));
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const kind = cacheKind(request, self.location.origin, BASE);
  if (kind === 'page') event.respondWith(networkFirst(event, request));
  else if (kind === 'asset') event.respondWith(cacheFirst(event, request));
  else if (kind === 'image') event.respondWith(staleWhileRevalidate(event, request));
});

// Première visite : la page s'affiche avant que le service worker la contrôle. Elle lui envoie son
// adresse et ses fichiers pour qu'il les garde (src/scripts/pwa.ts).
async function warm(data) {
  if (typeof data.page === 'string') {
    const page = { method: 'GET', url: data.page, mode: 'navigate', destination: 'document' };
    if (cacheKind(page, self.location.origin, BASE) === 'page') {
      const cache = await caches.open(CACHES.page);
      if (!(await cache.match(data.page))) {
        try {
          await store(CACHES.page, data.page, await fetch(data.page));
        } catch (error) {
          // Hors connexion : rien à garder.
        }
      }
    }
  }
  const resources = Array.isArray(data.resources) ? data.resources.filter((url) => typeof url === 'string').slice(0, 200) : [];
  await Promise.all(resources.map(warmOne));
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'vtc:warm') event.waitUntil(warm(data));
});

// Notification de l'espace chauffeur : un clic ouvre (ou retrouve) la page indiquée, sur le site seulement.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const wanted = new URL((event.notification.data && event.notification.data.url) || BASE, self.location.origin);
  const target = wanted.origin === self.location.origin && wanted.pathname.startsWith(BASE) ? wanted.href : new URL(BASE, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url === target);
      return open ? open.focus() : self.clients.openWindow(target);
    }),
  );
});
