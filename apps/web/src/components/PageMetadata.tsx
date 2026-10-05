import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { pageMetadata, siteOrigin } from "../lib/pageMetadata";
import { presentationMode, publicAsset } from "../lib/deployment";

export default function PageMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = pageMetadata(pathname);
    const origin =
      siteOrigin(import.meta.env.VITE_PUBLIC_SITE_URL) ||
      window.location.origin;
    document.title = page.title;
    const fields = {
      description: page.description,
      robots:
        page.indexable && !presentationMode
          ? "index,follow"
          : "noindex,nofollow",
      "og:title": page.title,
      "og:description": page.description,
      "og:url": `${origin}${page.indexable ? page.path : "/"}`,
      "og:image": `${origin}${publicAsset("brand/social-preview.png")}`,
      "twitter:title": page.title,
      "twitter:description": page.description,
      "twitter:image": `${origin}${publicAsset("brand/social-preview.png")}`,
    };
    for (const [name, content] of Object.entries(fields)) {
      const key = name.startsWith("og:") ? "property" : "name";
      let meta = document.head.querySelector<HTMLMetaElement>(
        `meta[${key}="${name}"]`,
      );
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute(key, name);
        document.head.append(meta);
      }
      meta.content = content;
    }
    let canonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (page.indexable && !presentationMode) {
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.append(canonical);
      }
      canonical.href = `${origin}${page.path}`;
    } else canonical?.remove();
  }, [pathname]);
  return null;
}
