import { PrismaClient } from "@prisma/client";
const client = new PrismaClient();
try {
  await client.$queryRaw`SELECT 1`;
  console.log(
    "PostgreSQL is reachable. Database credentials are loaded privately from .env.",
  );
} finally {
  await client.$disconnect();
}
