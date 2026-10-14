import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const users = await db.user.findMany({
  where: {
    id: { startsWith: "export-test-" },
    email: { endsWith: "@example.test" },
    name: "Export test",
  },
  select: { id: true },
});
if (users.length) {
  const ids = users.map((u) => u.id);
  await db.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] },
  });
  await db.loginEvent.deleteMany({ where: { userId: { in: ids } } });
  await db.trip.deleteMany({
    where: { ownerId: { in: ids } },
  });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}
console.log(`Cleaned ${users.length} interrupted export-test accounts.`);
await db.$disconnect();
