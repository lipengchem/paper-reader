import { spawn } from "node:child_process";

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

async function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
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

async function main() {
  await run("npm", ["run", "sync:library"]);
  await run("npm", ["run", "build"]);
  await run("git", ["add", "."]);

  const status = await capture("git", ["status", "--short"]);
  if (!status) {
    console.log("No paper-reader changes to publish.");
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  await run("git", ["commit", "-m", `Update paper library ${date}`]);
  await run("git", ["push"]);
}

main().catch((error) => {
  console.error(`paper-reader publish failed: ${error.message}`);
  process.exitCode = 1;
});
