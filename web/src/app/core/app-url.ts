// The app may be served from the domain root (localhost:4200/) or a sub-path (ytakok.github.io/agent-hub/).
// <base href> carries that prefix; these helpers make URLs respect it. Never hard-code a leading "/" for app assets.

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // https:, data:, mailto:, protocol-relative…

/**
 * Asset path relative to <base href>: "/tenants/x/logo.svg" → "tenants/x/logo.svg".
 * Relative URLs in <img src>, fetch() and HttpClient resolve against the base, so this works at any sub-path.
 * Absolute/external URLs pass through unchanged.
 */
export function assetUrl(url: string): string {
  if (!url || EXTERNAL.test(url)) return url;
  return url.replace(/^\/+/, '');
}

/** Absolute URL of an in-app route, including the sub-path — for links leaving the app (e.g. Firebase emails). */
export function appUrl(path: string, doc: Document = document): string {
  return new URL(assetUrl(path), doc.baseURI).href;
}
