import { createPrivateKey, sign } from "node:crypto";

// Apple's limit is six months; renewing monthly keeps a wide margin.
const SECRET_LIFETIME_S = 180 * 86400;
const RENEW_AFTER_MS = 30 * 86400 * 1000;
const base64url = (value: string | Buffer) =>
  Buffer.from(value).toString("base64url");

type AppleKey = {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
};
// Apple accepts no static client secret: it must be a JWT signed (ES256) with
// the .p8 key from the Apple Developer account.
export function appleClientSecret(key: AppleKey, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const header = base64url(
    JSON.stringify({ alg: "ES256", kid: key.keyId, typ: "JWT" }),
  );
  const payload = base64url(
    JSON.stringify({
      iss: key.teamId,
      iat,
      exp: iat + SECRET_LIFETIME_S,
      aud: "https://appleid.apple.com",
      sub: key.clientId,
    }),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    // .env files usually hold the key on one line with literal \n.
    key: createPrivateKey(key.privateKey.replace(/\\n/g, "\n")),
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${base64url(signature)}`;
}

export function appleProvider(env: NodeJS.ProcessEnv = process.env) {
  const key = {
    clientId: env.APPLE_CLIENT_ID ?? "",
    teamId: env.APPLE_TEAM_ID ?? "",
    keyId: env.APPLE_KEY_ID ?? "",
    privateKey: env.APPLE_PRIVATE_KEY ?? "",
  };
  if (!key.clientId || !key.teamId || !key.keyId || !key.privateKey)
    return null;
  let cached = { secret: "", renewAt: 0 };
  try {
    cached = {
      secret: appleClientSecret(key),
      renewAt: Date.now() + RENEW_AFTER_MS,
    };
  } catch {
    console.error(
      "Apple sign-in is disabled: APPLE_PRIVATE_KEY is not a valid .p8 key.",
    );
    return null;
  }
  return {
    clientId: key.clientId,
    // Better Auth reads this on every token exchange, so a server that runs
    // for months never sends an expired secret.
    get clientSecret() {
      if (Date.now() >= cached.renewAt)
        cached = {
          secret: appleClientSecret(key),
          renewAt: Date.now() + RENEW_AFTER_MS,
        };
      return cached.secret;
    },
  };
}
