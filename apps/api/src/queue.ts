import PgBoss from "pg-boss";
import { config } from "./config.js";
let ready: Promise<PgBoss> | undefined;
export async function getQueue() {
  if (!ready)
    ready = (async () => {
      const boss = new PgBoss(config.DATABASE_URL);
      boss.on("error", (error) => console.error("Queue error:", error.message));
      await boss.start();
      await boss.createQueue("menu-import");
      await boss.createQueue("trip-export");
      return boss;
    })().catch((error) => {
      ready = undefined;
      throw error;
    });
  return ready;
}
