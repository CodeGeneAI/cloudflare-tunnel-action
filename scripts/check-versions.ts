import * as fs from "node:fs";
import * as path from "node:path";

interface PackageJson {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

const NPM_REGISTRY = "https://registry.npmjs.org";

const fetchLatestNpm = async (name: string): Promise<string> => {
  const response = await fetch(`${NPM_REGISTRY}/${encodeURIComponent(name)}`);
  if (!response.ok) {
    throw new Error(`npm ${name}: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { "dist-tags"?: { latest?: string } };
  const latest = body["dist-tags"]?.latest;
  if (!latest) throw new Error(`npm ${name}: no dist-tags.latest`);
  return latest;
};

const main = async (): Promise<void> => {
  const pkgPath = path.resolve(import.meta.dir, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as PackageJson;
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  const drift: string[] = [];
  for (const [name, range] of Object.entries(all)) {
    try {
      const latest = await fetchLatestNpm(name);
      const pinned = range.replace(/^[~^]/, "");
      if (pinned.split(".")[0] !== latest.split(".")[0]) {
        drift.push(`${name}: pinned ${range} but latest is ${latest}`);
      } else {
        process.stdout.write(`ok ${name} ${range} (latest ${latest})\n`);
      }
    } catch (e) {
      process.stdout.write(
        `warn ${name}: ${e instanceof Error ? e.message : String(e)}\n`,
      );
    }
  }
  if (drift.length > 0) {
    process.stderr.write(
      `\nMajor-version drift detected:\n${drift.join("\n")}\n`,
    );
    process.exit(1);
  }
};

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
