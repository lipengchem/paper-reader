import { execFile as execFileCallback } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const execFile = promisify(execFileCallback);
const defaultFilesRepoRoot = "D:\\codex\\paper-reader-files";
const filesRepoRoot = path.resolve(process.env.PAPER_READER_FILES_REPO || defaultFilesRepoRoot);
const indexPath = path.join(filesRepoRoot, "public", "library", "index.json");

async function firstPublishedAt(slug) {
  const { stdout } = await execFile(
    "git",
    [
      "-C",
      filesRepoRoot,
      "log",
      "--diff-filter=A",
      "--format=%cI",
      "--reverse",
      "--",
      `public/library/${slug}`,
    ],
    { windowsHide: true },
  );
  return stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);
}

async function main() {
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const items = Array.isArray(index.items) ? index.items : [];
  let changed = 0;

  for (const item of items) {
    if (!item?.slug) continue;
    const firstPublished = await firstPublishedAt(item.slug);
    if (!firstPublished || item.uploadedAt === firstPublished) continue;
    item.uploadedAt = firstPublished;
    changed += 1;
  }

  if (!changed) {
    console.log("Upload timestamps are already current.");
    return;
  }

  index.generatedAt = new Date().toISOString();
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(`Backfilled upload timestamps for ${changed} papers.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
