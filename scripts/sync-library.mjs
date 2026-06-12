import { copyFile, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultFilesRepoRoot = "D:\\codex\\paper-reader-files";
const defaultSourceRoot = "D:\\codex\\文献阅读\\自动化文献阅读";
const sourceRoot = path.resolve(process.env.PAPER_READER_SOURCE || defaultSourceRoot);
const filesRepoRoot = path.resolve(process.env.PAPER_READER_FILES_REPO || defaultFilesRepoRoot);
const libraryRoot = path.resolve(process.env.PAPER_READER_LIBRARY || path.join(filesRepoRoot, "public", "library"));
const processedPath = path.join(sourceRoot, "processed_zotero_items.json");
const dateSlugPattern = /^\d{8}-[a-z0-9]+[a-z0-9-]*$/i;

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function normalizeSlash(value) {
  return String(value || "").replaceAll("\\", "/");
}

function titleFromSlug(slug) {
  return slug
    .replace(/^\d{8}-/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function dateFromSlug(slug) {
  const raw = slug.slice(0, 8);
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

async function readJsonMaybe(target, fallback = null) {
  if (!(await exists(target))) return fallback;
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch {
    return fallback;
  }
}

async function readTextMaybe(target) {
  if (!(await exists(target))) return "";
  return readFile(target, "utf8");
}

function loadProcessedLookup(records) {
  const lookup = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const output = normalizeSlash(record.output_folder || record.outputFolder || record.folder || "");
    const copied = normalizeSlash(record.copied_pdf_path || record.copiedPdfPath || "");
    const slug = path.posix.basename(output || copied.replace(/\/paper\.pdf$/i, ""));
    if (slug) lookup.set(slug, record);
  }
  return lookup;
}

function countFigures(markdown, sourceMap) {
  const imageLinks = markdown.match(/!\[[^\]]*]\([^)]+\)/g)?.length || 0;
  const sourceFigures = Array.isArray(sourceMap?.figures) ? sourceMap.figures.length : 0;
  return Math.max(imageLinks, sourceFigures);
}

function countParagraphs(markdown, sourceMap) {
  const mapped =
    sourceMap?.paragraph_count ||
    sourceMap?.paragraphCount ||
    (Array.isArray(sourceMap?.body_pairs) ? sourceMap.body_pairs.length : 0) ||
    (Array.isArray(sourceMap?.paragraphs) ? sourceMap.paragraphs.length : 0);
  if (mapped) return Number(mapped);

  const bodyPairs = markdown.match(/\*\*(Original|原文|英文|English):\*\*/gi)?.length || 0;
  if (bodyPairs) return bodyPairs;

  return markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith("#") && !block.startsWith("!")).length;
}

async function copyIfPresent(source, target) {
  if (!(await exists(source))) return false;
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return true;
}

async function syncPaperFolder(entry, processedLookup, existingLookup, syncStartedAt) {
  const slug = entry.name;
  const sourceFolder = path.join(sourceRoot, slug);
  const targetFolder = path.join(libraryRoot, slug);
  const pdfSource = path.join(sourceFolder, "paper.pdf");
  const mdSource = path.join(sourceFolder, "paper.md");

  if (!(await exists(pdfSource)) || !(await exists(mdSource))) return null;

  await rm(targetFolder, { recursive: true, force: true });
  await mkdir(targetFolder, { recursive: true });

  await copyFile(pdfSource, path.join(targetFolder, "paper.pdf"));
  await copyFile(mdSource, path.join(targetFolder, "paper.md"));
  await copyIfPresent(path.join(sourceFolder, "source_map.json"), path.join(targetFolder, "source_map.json"));
  await copyIfPresent(path.join(sourceFolder, "translation_notes.md"), path.join(targetFolder, "translation_notes.md"));
  await copyIfPresent(path.join(sourceFolder, "related_reading.md"), path.join(targetFolder, "related_reading.md"));

  const assetsSource = path.join(sourceFolder, "assets");
  if (await exists(assetsSource)) {
    await cp(assetsSource, path.join(targetFolder, "assets"), { recursive: true });
  } else {
    await mkdir(path.join(targetFolder, "assets"), { recursive: true });
  }

  const markdown = await readTextMaybe(mdSource);
  const sourceMap = await readJsonMaybe(path.join(sourceFolder, "source_map.json"), {});
  const record = processedLookup.get(slug) || {};
  const existing = existingLookup.get(slug) || {};
  const collections = record.collection_path || record.collections || record.collection || [];
  const collectionList = Array.isArray(collections) ? collections : [collections].filter(Boolean);

  return {
    slug,
    title: record.title || sourceMap?.title || titleFromSlug(slug),
    date: record.date || sourceMap?.date || dateFromSlug(slug),
    taskDate: record.task_date || dateFromSlug(slug),
    uploadedAt: existing.uploadedAt || existing.createdAt || syncStartedAt,
    journal: record.journal_publicationTitle || record.journal || sourceMap?.journal || "Unknown journal",
    zoteroKey: record.zotero_item_key || record.item_key || record.zotero_key || record.zoteroKey || "",
    collections: collectionList,
    pdfPath: `library/${slug}/paper.pdf`,
    markdownPath: `library/${slug}/paper.md`,
    relatedReading: (await exists(path.join(sourceFolder, "related_reading.md"))) || /Related Reading/i.test(markdown),
    paragraphCount: countParagraphs(markdown, sourceMap),
    figureCount: countFigures(markdown, sourceMap),
  };
}

async function main() {
  await mkdir(libraryRoot, { recursive: true });
  const syncStartedAt = new Date().toISOString();
  const existingIndex = await readJsonMaybe(path.join(libraryRoot, "index.json"), {});
  const existingLookup = new Map(
    (Array.isArray(existingIndex?.items) ? existingIndex.items : [])
      .filter((item) => item?.slug)
      .map((item) => [item.slug, item]),
  );
  const processed = await readJsonMaybe(processedPath, []);
  const processedLookup = loadProcessedLookup(processed);
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory() && dateSlugPattern.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const items = [];
  for (const folder of folders) {
    const synced = await syncPaperFolder(folder, processedLookup, existingLookup, syncStartedAt);
    if (synced) items.push(synced);
  }

  items.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  await writeFile(
    path.join(libraryRoot, "index.json"),
    `${JSON.stringify({ generatedAt: syncStartedAt, items }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Synced ${items.length} paper reader packages to ${libraryRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
