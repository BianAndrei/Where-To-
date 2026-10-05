import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as safeFetch } from "undici";
import robotsParser from "robots-parser";
import { HttpError, assert } from "./db.js";
export function publicAddress(ip: string) {
  if (!isIP(ip)) return false;
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    // Accept global unicast only; mapped, translated and scoped addresses are excluded.
    return /^[23][0-9a-f]{3}:/.test(v) && !/^(2001:|2002:|3fff:)/.test(v);
  }
  const parts = ip.split(".").map(Number);
  const a = parts[0]!,
    b = parts[1]!;
  return (
    parts.length === 4 &&
    !(
      [0, 10, 127].includes(a) ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0)
    )
  );
}
export async function fetchPublic(
  input: string,
  maxBytes = 10 * 1024 * 1024,
  redirects = 0,
  respectRobots = false,
): Promise<{ body: Buffer; type: string; url: string }> {
  assert(redirects <= 4, 400, "Too many redirects.");
  const url = new URL(input);
  if (respectRobots) await obeyRobots(input);
  assert(
    ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      (!url.port || ["80", "443"].includes(url.port)),
    400,
    "Use a public restaurant website URL.",
  );
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true });
  assert(
    addresses.length > 0 && addresses.every((a) => publicAddress(a.address)),
    400,
    "Private and local network addresses cannot be imported.",
  );
  const selected = addresses[0]!;
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if ((options as any).all) (callback as any)(null, [selected]);
        else (callback as any)(null, selected.address, selected.family);
      },
    },
  });
  try {
    const response = await safeFetch(url, {
      dispatcher,
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
      headers: {
        "User-Agent":
          "WheretoMenuBot/1.0 (+menu import requested by a traveller)",
        Accept: "text/html,application/pdf,image/*;q=0.8",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      assert(location, 400, "Invalid menu redirect.");
      await response.body?.cancel();
      return fetchPublic(
        new URL(location, url).toString(),
        maxBytes,
        redirects + 1,
        respectRobots,
      );
    }
    assert(
      response.ok,
      400,
      "The restaurant website could not be read. Open the original menu or upload a copy.",
      `SOURCE_HTTP_${response.status}`,
    );
    assert(
      Number(response.headers.get("content-length") || 0) <= maxBytes,
      413,
      "The menu is too large. Upload a file under 10 MB.",
    );
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const chunk of response.body!) {
      length += chunk.length;
      if (length > maxBytes) throw new HttpError(413, "The menu is too large.");
      chunks.push(chunk);
    }
    return {
      body: Buffer.concat(chunks),
      type: response.headers.get("content-type")?.split(";")[0] ?? "",
      url: url.toString(),
    };
  } finally {
    await dispatcher.close();
  }
}
export async function obeyRobots(input: string) {
  const url = new URL(input);
  const robotsUrl = new URL("/robots.txt", url).toString();
  try {
    const result = await fetchPublic(robotsUrl, 512000);
    const parser = robotsParser(robotsUrl, result.body.toString());
    assert(
      parser.isAllowed(input, "WheretoMenuBot") !== false,
      403,
      "This website does not permit automated menu imports. Open the original menu or upload your own photo.",
    );
  } catch (error) {
    if (
      error instanceof HttpError &&
      ["SOURCE_HTTP_404", "SOURCE_HTTP_410"].includes(error.code)
    )
      return;
    throw error; // Only an explicitly absent robots file permits continuing without it.
  }
}
