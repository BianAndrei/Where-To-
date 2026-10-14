import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

const email = "admin@test.com";
const databaseUrl = process.env.TEST_DATABASE_URL;
const password = process.env.TEST_ADMIN_PASSWORD;

if (process.env.NODE_ENV !== "test")
  throw new Error("Test-admin provisioning requires NODE_ENV=test.");
if (!databaseUrl)
  throw new Error("Set TEST_DATABASE_URL to an isolated test database.");
if (!password || password.length < 16 || password.length > 200)
  throw new Error("Set TEST_ADMIN_PASSWORD to a 16-200 character test secret.");

const parsedUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
const schema = parsedUrl.searchParams.get("schema") ?? "";
const isolatedName = /(?:^|[_-])test(?:$|[_-])/i;
if (!isolatedName.test(databaseName) && !isolatedName.test(schema))
  throw new Error(
    "TEST_DATABASE_URL must target a database or schema whose name includes 'test'.",
  );

const db = new PrismaClient({ datasourceUrl: databaseUrl });
try {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== "admin")
      throw new Error(
        "admin@test.com already exists without the admin role; no account changes were made.",
      );
    if (!existing.emailVerified || existing.suspendedAt)
      throw new Error(
        "admin@test.com is unverified or inactive; no account changes were made.",
      );
    const credential = await db.account.findFirst({
      where: { userId: existing.id, providerId: "credential" },
      select: { password: true },
    });
    if (!credential?.password)
      throw new Error(
        "admin@test.com has no password credential; no account changes were made.",
      );
    console.log("Test administrator already exists; left unchanged.");
  } else {
    const userId = randomUUID();
    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          name: "Test administrator",
          email,
          role: "admin",
          emailVerified: true,
          accounts: {
            create: {
              id: randomUUID(),
              accountId: userId,
              providerId: "credential",
              password: passwordHash,
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          targetType: "user",
          targetId: userId,
          action: "test_admin.provisioned",
          after: { role: "admin" },
        },
      });
    });
    console.log("Created test administrator admin@test.com.");
  }
} finally {
  await db.$disconnect();
}
