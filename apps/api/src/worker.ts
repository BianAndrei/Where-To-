import { getQueue } from "./queue.js";
import { processMenuJob } from "./menu-worker.js";
import { processExportJob } from "./export-worker.js";
import { db } from "./db.js";
import { recoverDispatches } from "./job-runtime.js";
const boss = await getQueue();
await boss.work<{ id: string }>(
  "menu-import",
  { batchSize: 1 },
  async (jobs) => {
    for (const job of jobs) await processMenuJob(job.data.id);
  },
);
await boss.work<{ id: string }>(
  "trip-export",
  { batchSize: 1 },
  async (jobs) => {
    for (const job of jobs) await processExportJob(job.data.id);
  },
);
console.log("Whereto worker ready (menus and exports).");
let ticking = false;
const heartbeat = async () => {
  if (ticking) return;
  ticking = true;
  try {
    await db.workerHeartbeat.upsert({
      where: { id: "main" },
      create: { id: "main" },
      update: { seenAt: new Date() },
    });
    await recoverDispatches();
  } catch {
    console.error("Worker heartbeat or dispatch recovery failed.");
  } finally {
    ticking = false;
  }
};
await heartbeat();
setInterval(() => void heartbeat(), 30000).unref();
process.on("SIGTERM", () => void boss.stop());
