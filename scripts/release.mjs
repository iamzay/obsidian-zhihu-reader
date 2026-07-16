import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRootUrl = new URL("../", import.meta.url);
const projectRoot = fileURLToPath(projectRootUrl);
const versionFiles = [
  "package.json",
  "package-lock.json",
  "manifest.json",
  "versions.json",
];
const releaseAssets = ["main.js", "manifest.json", "styles.css"];
const semverPattern = /^\d+\.\d+\.\d+$/u;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const shouldPush = args.includes("--push");
const unexpectedFlags = args.filter(
  (argument) => argument.startsWith("-") && argument !== "--push",
);
if (unexpectedFlags.length > 0) {
  fail(`Unknown option: ${unexpectedFlags.join(", ")}`);
}

const versionArguments = args.filter((argument) => !argument.startsWith("-"));
if (versionArguments.length !== 1) {
  printHelp();
  fail("Provide exactly one of patch, minor, major, or an explicit version.");
}
const [versionArgument] = versionArguments;

const snapshots = new Map();
let createdCommit = false;

try {
  ensureCleanWorktree();

  const packageJson = await readJson("package.json");
  const packageLock = await readJson("package-lock.json");
  const manifest = await readJson("manifest.json");
  const versions = await readJson("versions.json");
  assertCurrentVersionsMatch(packageJson, packageLock, manifest, versions);

  const currentVersion = packageJson.version;
  const nextVersion = resolveVersion(currentVersion, versionArgument);
  ensureVersionIncreases(currentVersion, nextVersion);
  ensureTagDoesNotExist(nextVersion);

  for (const path of versionFiles) {
    snapshots.set(path, await readFile(projectPath(path), "utf8"));
  }

  packageJson.version = nextVersion;
  packageLock.version = nextVersion;
  packageLock.packages[""].version = nextVersion;
  manifest.version = nextVersion;
  versions[nextVersion] = manifest.minAppVersion;

  await Promise.all([
    writeJson("package.json", packageJson),
    writeJson("package-lock.json", packageLock),
    writeJson("manifest.json", manifest),
    writeJson("versions.json", versions),
  ]);

  console.log(`\nPreparing Zhihu Reader ${nextVersion}...\n`);
  run("npm", ["run", "check"]);
  ensureReleaseAssetsExist();

  run("git", ["add", ...versionFiles]);
  run("git", ["commit", "-m", `chore: release ${nextVersion}`]);
  createdCommit = true;
  run("git", [
    "tag",
    "-a",
    nextVersion,
    "-m",
    `Zhihu Reader ${nextVersion}`,
  ]);

  if (shouldPush) {
    run("git", ["push", "origin", "HEAD"]);
    run("git", ["push", "origin", nextVersion]);
    console.log(
      `\nReleased ${nextVersion}. GitHub Actions will publish the assets.`,
    );
  } else {
    console.log(`\nRelease ${nextVersion} is committed and tagged locally.`);
    console.log("Review it, then publish with:");
    console.log(`  git push origin HEAD`);
    console.log(`  git push origin ${nextVersion}`);
  }
} catch (error) {
  if (!createdCommit && snapshots.size > 0) {
    await restoreSnapshots();
    runAllowFailure("git", ["restore", "--staged", ...versionFiles]);
  }
  fail(error instanceof Error ? error.message : String(error));
}

function ensureCleanWorktree() {
  const status = capture("git", ["status", "--porcelain"]);
  if (status.length > 0) {
    throw new Error(
      "The worktree is not clean. Commit or stash changes before releasing.",
    );
  }
}

function assertCurrentVersionsMatch(
  packageJson,
  packageLock,
  manifest,
  versions,
) {
  const currentVersion = packageJson.version;
  if (
    manifest.version !== currentVersion ||
    packageLock.version !== currentVersion ||
    packageLock.packages?.[""]?.version !== currentVersion
  ) {
    throw new Error(
      "package.json, package-lock.json, and manifest.json versions do not match.",
    );
  }
  if (versions[currentVersion] !== manifest.minAppVersion) {
    throw new Error(
      "versions.json does not map the current version to minAppVersion.",
    );
  }
}

function resolveVersion(currentVersion, argument) {
  if (semverPattern.test(argument)) {
    return argument;
  }
  if (!["patch", "minor", "major"].includes(argument)) {
    throw new Error(
      `Invalid version "${argument}". Use patch, minor, major, or X.Y.Z.`,
    );
  }
  const [major, minor, patch] = parseVersion(currentVersion);
  switch (argument) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "major":
      return `${major + 1}.0.0`;
    default:
      throw new Error(`Unsupported release type: ${argument}`);
  }
}

function ensureVersionIncreases(currentVersion, nextVersion) {
  const current = parseVersion(currentVersion);
  const next = parseVersion(nextVersion);
  for (let index = 0; index < current.length; index += 1) {
    if (next[index] > current[index]) {
      return;
    }
    if (next[index] < current[index]) {
      break;
    }
  }
  throw new Error(
    `Release version ${nextVersion} must be greater than ${currentVersion}.`,
  );
}

function parseVersion(version) {
  if (!semverPattern.test(version)) {
    throw new Error(`Unsupported semantic version: ${version}`);
  }
  return version.split(".").map(Number);
}

function ensureTagDoesNotExist(version) {
  if (capture("git", ["tag", "--list", version]) !== "") {
    throw new Error(`Git tag ${version} already exists.`);
  }
}

function ensureReleaseAssetsExist() {
  for (const asset of releaseAssets) {
    if (!existsSync(projectPath(asset))) {
      throw new Error(`Release asset was not generated: ${asset}`);
    }
  }
}

async function restoreSnapshots() {
  await Promise.all(
    [...snapshots].map(async ([path, contents]) => {
      await writeFile(projectPath(path), contents, "utf8");
    }),
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(projectPath(path), "utf8"));
}

async function writeJson(path, value) {
  await writeFile(projectPath(path), `${JSON.stringify(value, null, 2)}\n`);
}

function projectPath(path) {
  return fileURLToPath(new URL(path, projectRootUrl));
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed.`);
  }
}

function runAllowFailure(command, commandArgs) {
  spawnSync(command, commandArgs, {
    cwd: projectRoot,
    stdio: "ignore",
  });
}

function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed.`);
  }
  return result.stdout.trim();
}

function printHelp() {
  console.log(`Usage:
  npm run release -- patch
  npm run release -- minor
  npm run release -- major
  npm run release -- 1.2.3
  npm run release -- patch --push

The script requires a clean worktree, synchronizes all version files, runs
npm run check, creates a release commit and an annotated tag, and optionally
pushes both to origin. Pushing the tag triggers the GitHub Release workflow.`);
}

function fail(message) {
  console.error(`\nRelease failed: ${message}`);
  process.exit(1);
}
