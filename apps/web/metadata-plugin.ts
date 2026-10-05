import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { pageMetadata, publicPages, siteOrigin } from "./src/lib/pageMetadata";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export function metadataPlugin(originValue?: string): Plugin {
  const origin = siteOrigin(originValue);
  let outDir: string;
  let presentation = false;
  let basePath = "/";
  const metadata = (path: string) => {
    const page = pageMetadata(path);
    const fields = [
      `<title>${escape(page.title)}</title>`,
      `<meta name="description" content="${escape(page.description)}">`,
      `<meta name="robots" content="${page.indexable && !presentation ? "index,follow" : "noindex,nofollow"}">`,
      '<meta property="og:type" content="website">',
      '<meta property="og:site_name" content="Whereto">',
      `<meta property="og:title" content="${escape(page.title)}">`,
      `<meta property="og:description" content="${escape(page.description)}">`,
      `<meta property="og:image" content="${escape(origin)}/brand/social-preview.png">`,
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta property="og:image:alt" content="A lovely trip. A clear budget. Whereto’s pastel travel map and suitcase.">',
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:title" content="${escape(page.title)}">`,
      `<meta name="twitter:description" content="${escape(page.description)}">`,
      `<meta name="twitter:image" content="${escape(origin)}/brand/social-preview.png">`,
    ];
    if (origin && page.indexable && !presentation)
      fields.push(
        `<link rel="canonical" href="${escape(origin + page.path)}">`,
        `<meta property="og:url" content="${escape(origin + page.path)}">`,
      );
    return fields.join("\n    ");
  };
  const render = (html: string, path: string) =>
    html.replace(
      /<!-- whereto:metadata -->[\s\S]*?<!-- \/whereto:metadata -->/,
      `<!-- whereto:metadata -->\n    ${metadata(path)}\n    <!-- /whereto:metadata -->`,
    );
  return {
    name: "whereto-page-metadata",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      presentation = config.mode === "presentation";
      basePath = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        if (presentation) html = html.replace(/<link\s+rel="manifest"[^>]*>/i, "");
        return render(html, (context.originalUrl ?? "/").split("?")[0]!);
      },
    },
    async writeBundle() {
      const html = await readFile(resolve(outDir, "index.html"), "utf8");
      for (const path of [
        ...Object.keys(publicPages).filter((path) => path !== "/"),
        "/demo",
        "/signup",
        "/login",
        "/app",
        "/app/new",
        "/app/settings",
        "/reset-password",
        "/admin",
        "/two-factor",
      ]) {
        const directory = resolve(outDir, path.slice(1));
        await mkdir(directory, { recursive: true });
        await writeFile(resolve(directory, "index.html"), render(html, path));
      }
      await writeFile(resolve(outDir, "404.html"), render(html, "/not-found"));
      if (presentation) {
        await writeFile(
          resolve(outDir, ".htaccess"),
          `DirectoryIndex index.html\nRewriteEngine On\nRewriteBase ${basePath}\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteCond %{REQUEST_FILENAME} !-d\nRewriteRule ^ ${basePath}index.html [L]\n`,
        );
        await writeFile(
          resolve(outDir, "robots.txt"),
          "User-agent: *\nDisallow: /\n",
        );
        return;
      }
      await writeFile(
        resolve(outDir, "robots.txt"),
        "User-agent: *\nDisallow: /admin\nDisallow: /two-factor\nDisallow: /app\nDisallow: /share/\nDisallow: /join/\nDisallow: /api/\nDisallow: /files/\nDisallow: /login\nDisallow: /signup\nDisallow: /reset-password\nDisallow: /demo\n" +
          (origin ? `Sitemap: ${origin}/sitemap.xml\n` : ""),
      );
      if (origin)
        await writeFile(
          resolve(outDir, "sitemap.xml"),
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(
            publicPages,
          )
            .map((path) => `<url><loc>${escape(origin + path)}</loc></url>`)
            .join("")}</urlset>`,
        );
    },
  };
}
