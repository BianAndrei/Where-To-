import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../apps/api/src/db";
import { auth } from "../apps/api/src/auth";
import { milestone } from "../apps/api/src/admin-domain";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error(
    "Usage: npm run admin:owner -- email@example.com [--prepare-local]",
  );
const prepare = process.argv.includes("--prepare-local");
let user = await db.user.findUnique({ where: { email } });
if (prepare) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.RESEND_API_KEY ||
    !["localhost", "127.0.0.1"].includes(new URL(process.env.APP_URL!).hostname)
  )
    throw new Error(
      "Local owner preparation requires localhost and the local development mailbox.",
    );
  if (!user) {
    user = await db.user.create({
      data: {
        id: randomUUID(),
        name: "Whereto owner",
        email,
        emailVerified: false,
      },
    });
    await milestone(db, user.id, "account_created");
  }
  if (!user.emailVerified) {
    const resetPage = new URL("/reset-password", process.env.APP_URL);
    resetPage.searchParams.set("next", "/admin");
    resetPage.searchParams.set("email", email);
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: resetPage.href },
    });
    const reset = await db.devMail.findFirstOrThrow({
      where: { to: email, subject: "Reset your Whereto password" },
      orderBy: { createdAt: "desc" },
    });
    await auth.api.sendVerificationEmail({
      body: { email, callbackURL: reset.url },
    });
  }
} else if (!user?.emailVerified)
  throw new Error(
    "Create and verify this account first. No owner configuration was changed.",
  );
if (!user) throw new Error("Account not found.");
const envPath = resolve(".env");
const contents = await readFile(envPath, "utf8");
const line = `ADMIN_OWNER_USER_ID=${user.id}`;
await writeFile(
  envPath,
  /^ADMIN_OWNER_USER_ID=.*$/m.test(contents)
    ? contents.replace(/^ADMIN_OWNER_USER_ID=.*$/m, line)
    : `${contents.trimEnd()}\n${line}\n`,
);
console.log(
  `Owner ID configured for ${email}. Email verification and session TOTP remain mandatory. Restart the API to load the owner ID.`,
);
if (!user.emailVerified)
  console.log(
    "The account has no password yet. Its owner must open the verification message in the local inbox and choose their own password.",
  );
await db.$disconnect();
