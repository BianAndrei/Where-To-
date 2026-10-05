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
  await db.trip.deleteMany({
    where: { ownerId: { in: users.map((u) => u.id) } },
  });
  await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
}
console.log(`Cleaned ${users.length} interrupted export-test accounts.`);
await db.$disconnect();
