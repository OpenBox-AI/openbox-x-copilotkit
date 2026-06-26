#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const SDK_DIR = resolve(ROOT_DIR, process.env.OPENBOX_SDK_DIR || "../openbox-sdk");
const args = new Set(process.argv.slice(2));
const shouldBuild = args.has("--build");
const shouldInstall = args.has("--install") || args.has("--link") || shouldBuild;

assertSdkPackage();

if (shouldBuild) {
  run("npm", ["run", "build"], SDK_DIR);
}

if (shouldInstall) {
  const tarball = packSdk();
  installPackage(ROOT_DIR, tarball);
  installPackage(join(ROOT_DIR, "agent"), tarball);
}

verifyPackage(ROOT_DIR);
verifyPackage(join(ROOT_DIR, "agent"));

console.log(
  `[openbox-sdk] local SDK package ready: ${relativePath(SDK_DIR)} -> root + agent`,
);

function assertSdkPackage() {
  const packagePath = join(SDK_DIR, "package.json");
  if (!existsSync(packagePath)) {
    fail(`OPENBOX_SDK_DIR does not contain package.json: ${SDK_DIR}`);
  }
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  if (pkg.name !== "@openbox-ai/openbox-sdk") {
    fail(`OPENBOX_SDK_DIR is not @openbox-ai/openbox-sdk: ${SDK_DIR}`);
  }
}

function packSdk() {
  const packDir = mkdtempSync(join(tmpdir(), "openbox-sdk-pack-"));
  const result = spawnSync(
    "npm",
    ["pack", "--json", "--pack-destination", packDir],
    {
      cwd: SDK_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      shell: process.platform === "win32",
    },
  );
  if (result.status !== 0) process.exit(result.status || 1);
  const pack = JSON.parse(result.stdout.trim())[0];
  return join(packDir, pack.filename);
}

function installPackage(projectDir, tarball) {
  const packageDir = join(projectDir, "node_modules", "@openbox-ai", "openbox-sdk");
  rmSync(packageDir, { recursive: true, force: true });
  run("npm", ["install", "--no-save", tarball], projectDir);
}

function verifyPackage(projectDir) {
  const packageDir = join(projectDir, "node_modules", "@openbox-ai", "openbox-sdk");
  if (!existsSync(packageDir)) {
    fail(`missing @openbox-ai/openbox-sdk in ${relativePath(projectDir)}`);
  }
  const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  if (!pkg.exports?.["./copilotkit/react"]) {
    fail("local SDK package is missing the ./copilotkit/react export.");
  }
  const reactEntry = join(packageDir, "dist", "copilotkit", "react.js");
  if (!existsSync(reactEntry)) {
    fail(`SDK React entry is missing in ${relativePath(packageDir)}.`);
  }
  const reactBundled = readFileSync(reactEntry, "utf8");
  if (!reactBundled.includes("isOpenBoxCopilotResultMessage")) {
    fail(
      "local SDK React entry is missing the typed OpenBox result message helper. Run npm run openbox:sdk:local.",
    );
  }
  const dist = join(packageDir, "dist", "copilotkit", "index.js");
  if (!existsSync(dist)) {
    fail(`SDK dist is missing in ${relativePath(packageDir)}. Run with --build.`);
  }
  const bundled = readFileSync(dist, "utf8");
  if (bundled.includes("openBoxInteractiveReviewHandoff")) {
    fail(
      "local SDK dist still includes the removed synthetic interactive handoff bridge. Run npm run openbox:sdk:local.",
    );
  }
}

function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function relativePath(path) {
  return path.startsWith(ROOT_DIR) ? `.${path.slice(ROOT_DIR.length) || ""}` : path;
}

function fail(message) {
  console.error(`[openbox-sdk] ${message}`);
  process.exit(1);
}
