/**
 * Upload compressed WebP vocabulary cards to Cloudflare R2 via S3 API.
 *
 * Usage:
 *   $env:R2_ACCOUNT_ID="your_cloudflare_account_id"
 *   $env:R2_ACCESS_KEY_ID="your_r2_access_key_id"
 *   $env:R2_SECRET_ACCESS_KEY="your_r2_secret_access_key"
 *   $env:R2_BUCKET="english-assets"
 *   npm run upload:cards
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBP_DIR = path.resolve(__dirname, "../local-media/cards-webp");
const CONCURRENCY = Number(process.env.UPLOAD_CONCURRENCY || 12);

const accountId = process.env.R2_ACCOUNT_ID?.trim();
const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
const bucket = process.env.R2_BUCKET?.trim() || "english-assets";

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error("Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY.");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

async function main() {
  const files = (await readdir(WEBP_DIR)).filter((f) => f.endsWith(".webp")).sort();
  if (!files.length) {
    throw new Error(`No .webp files found in ${WEBP_DIR}`);
  }

  let index = 0;
  let uploaded = 0;
  const failed = [];

  async function worker() {
    while (index < files.length) {
      const filename = files[index++];
      try {
        const body = await readFile(path.join(WEBP_DIR, filename));
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `cards/${filename}`,
            Body: body,
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
        uploaded++;
      } catch (err) {
        failed.push(`${filename}: ${err instanceof Error ? err.message : String(err)}`);
      }
      const done = uploaded + failed.length;
      if (done % 250 === 0 || done === files.length) {
        console.log(`Progress: ${done}/${files.length} (uploaded: ${uploaded}, failed: ${failed.length})`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`Finished uploading ${uploaded} WebP cards to R2 bucket "${bucket}" under prefix "cards/".`);
  if (failed.length) {
    console.error("Sample errors:", failed.slice(0, 5));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
