import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const filesRepoRoot = process.env.PAPER_READER_FILES_REPO || "D:\\codex\\paper-reader-files";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: process.platform === "win32",
      stdio: "inherit",
      ...options,
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function capture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function publishContentRepo() {
  const tempParent = await mkdtemp(path.join(os.tmpdir(), "paper-reader-files-publish-"));
  const worktree = path.join(tempParent, "repo");
  let worktreeReady = false;

  try {
    await run("git", ["-C", filesRepoRoot, "fetch", "origin"]);
    await run("git", ["-C", filesRepoRoot, "worktree", "add", "--detach", worktree, "origin/main"]);
    worktreeReady = true;

    await run("node", [path.join(__dirname, "sync-library.mjs")], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PAPER_READER_FILES_REPO: worktree,
        PAPER_READER_ONLY_MISSING: "1",
      },
    });

    const status = await capture("git", ["status", "--short", "--", "public/library"], { cwd: worktree });
    if (!status) {
      console.log("No new reader packages to publish.");
      return;
    }

    await run("git", ["add", "--", "public/library"], { cwd: worktree });
    const date = new Date().toISOString().slice(0, 10);
    // `shell: true` on Windows requires the message to stay quoted as one argument.
    await run("git", ["commit", "-m", `"Publish paper readers ${date}"`], { cwd: worktree });
    await run("git", ["push", "origin", "HEAD:main"], { cwd: worktree });
  } finally {
    if (worktreeReady) {
      try {
        await run("git", ["-C", filesRepoRoot, "worktree", "remove", "--force", worktree]);
      } catch (error) {
        console.warn(`Could not remove temporary worktree: ${error.message}`);
      }
    }
    await rm(tempParent, { recursive: true, force: true });
  }
}

async function main() {
  await publishContentRepo();
  await run("npm", ["run", "build"], { cwd: repoRoot });

  console.log("Reader build completed. Library packages are published through paper-reader-files.");
}

main().catch((error) => {
  console.error(`paper-reader publish failed: ${error.message}`);
  process.exitCode = 1;
});
