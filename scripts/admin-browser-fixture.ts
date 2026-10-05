// Explicit local browser acceptance environment. Never run this against production.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
if (process.env.NODE_ENV === "production")
  throw new Error("Local fixtures are disabled in production.");
if (process.env.RESEND_API_KEY)
  throw new Error("Browser fixtures require local mail only.");
const mode = process.argv[2] ?? "start";
const path = resolve(".data/admin-browser-fixture.json");
const db = new PrismaClient();
if (mode === "clean") {
  const fixture = JSON.parse(await readFile(path, "utf8"));
  if (!fixture.email.endsWith("@example.test"))
    throw new Error("Not a disposable fixture.");
  const ids = [fixture.id, fixture.travellerId];
  await db.adminAudit.deleteMany({ where: { actorId: { in: ids } } });
  await db.trip.deleteMany({ where: { ownerId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.devMail.deleteMany({
    where: { to: { in: [fixture.email, fixture.travellerEmail] } },
  });
  await db.$disconnect();
  console.log("Disposable browser accounts removed.");
} else {
  process.env.APP_URL = "http://localhost:5174";
  process.env.WHERETO_NO_LISTEN = "true";
  const { auth } = await import("../apps/api/src/auth");
  if (mode === "code") {
    const fixture = JSON.parse(await readFile(path, "utf8"));
    const user = await db.user.findUniqueOrThrow({
      where: { id: fixture.id },
      select: { email: true },
    });
    if (user.email !== fixture.email || !user.email.endsWith("@example.test"))
      throw new Error("Not a disposable fixture.");
    const { symmetricDecrypt } = await import("better-auth/crypto");
    const factor = await db.twoFactor.findFirstOrThrow({
      where: { userId: fixture.id },
    });
    const context = await auth.$context;
    const secret = await symmetricDecrypt({
      key: context.secretConfig,
      data: factor.secret,
    });
    console.log(await auth.api.generateTOTP({ body: { secret } }));
    await db.$disconnect();
  } else {
    const email = `admin-browser-${randomUUID()}@example.test`,
      password = `Browser-${randomUUID()}!`;
    const result = await auth.api.signUpEmail({
      body: { name: "Browser acceptance owner", email, password },
    });
    const id = result.user.id;
    const travellerEmail = `traveller-browser-${randomUUID()}@example.test`;
    const traveller = await auth.api.signUpEmail({
      body: {
        name: "Browser acceptance traveller",
        email: travellerEmail,
        password,
      },
    });
    await db.user.updateMany({
      where: { id: { in: [id, traveller.user.id] } },
      data: { emailVerified: true },
    });
    process.env.ADMIN_OWNER_USER_ID = id;
    await mkdir(resolve(".data"), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        id,
        email,
        password,
        travellerId: traveller.user.id,
        travellerEmail,
      }),
    );
    const { app } = await import("../apps/api/src/server");
    app.listen(3002, "127.0.0.1", () =>
      console.log(
        "Isolated admin browser API ready on 3002. Fixture credentials are in .data/admin-browser-fixture.json.",
      ),
    );
  }
}
