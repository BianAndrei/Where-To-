import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { config } from "./config.js";
import { reserveProvider } from "./providers.js";
import { recordHealth } from "./integrations.js";
const s3 =
  process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
    ? new S3Client({
        endpoint: process.env.S3_ENDPOINT || undefined,
        region: process.env.S3_REGION || "us-east-1",
        forcePathStyle: !!process.env.S3_ENDPOINT,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY,
          secretAccessKey: process.env.S3_SECRET_KEY,
        },
      })
    : null;
function localPath(key: string) {
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(key) || key.includes(".."))
    throw new Error("Invalid storage key");
  const path = resolve(config.dataDir, "files", key);
  if (
    !path.startsWith(
      resolve(config.dataDir, "files") +
        String.fromCharCode(process.platform === "win32" ? 92 : 47),
    )
  )
    throw new Error("Invalid storage path");
  return path;
}
export async function putFile(key: string, body: Buffer, mime: string) {
  await reserveProvider(
    "storage",
    body.length,
    new Date().toISOString().slice(0, 7),
    Number(process.env.STORAGE_MONTHLY_WRITE_BYTES || 1000000000),
  );
  try {
    if (s3)
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: mime,
        }),
      );
    else {
      const path = localPath(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    }
    await recordHealth("storage", true);
  } catch (error) {
    await recordHealth("storage", false);
    throw error;
  }
}
export async function getFile(key: string) {
  if (s3) {
    const data = await s3.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
    return Buffer.from(await data.Body!.transformToByteArray());
  }
  return readFile(localPath(key));
}
export async function deleteFile(key: string) {
  if (s3)
    await s3.send(
      new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
  else await unlink(localPath(key)).catch(() => {});
}
