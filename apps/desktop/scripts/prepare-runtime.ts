import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, lstatSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(process.cwd(), '..', '..');
const staging = join(root, 'desktop-runtime');
const postgresSource = process.env.POSTGRES_RUNTIME_DIR ?? 'C:\\Program Files\\PostgreSQL\\16';

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(' ')}`);
}

async function copyRequired(source: string, destination: string) {
  if (!existsSync(source)) throw new Error(`Required desktop runtime was not found: ${source}`);
  await mkdir(dirname(destination), { recursive: true });
  // The Next standalone tree contains pnpm junctions. Release archives must
  // contain their targets rather than absolute links back to the build machine.
  await cp(source, destination, { recursive: true, dereference: true });
}

// --- Release hygiene -------------------------------------------------------
// `dereference: true` turns every pnpm junction into a real copy, so a package
// reachable through several links lands on disk several times and carries its
// own dependencies inside it (pkg-a/node_modules/pkg-b/node_modules/...). Two
// things follow:
//
//  1. Size. The staged tree grows to two or three times the real dependency
//     set (measured: 2.16 GB staged for a ~0.6 GB dependency closure).
//  2. Broken installer. Native packages for other platforms (the aarch64,
//     linux and darwin builds of sharp/libvips, ~16 MB each) make
//     electron-builder pick 7-Zip's ARM64 branch filter for app-64.7z. The
//     extractor inside the installer (nsis7z.dll, built on 7-Zip 19.00) cannot
//     decode that filter and dies with an access violation (0xC0000005) after
//     ~95% of the payload, so the installer exits silently and installs
//     nothing. Windows only ever loads win32-x64 binaries here, so the foreign
//     ones are dead weight in every sense.
//
// Both problems are fixed on the staged tree, so the result no longer depends
// on what the build machine's node_modules happens to contain.
// ---------------------------------------------------------------------------

/** npm scopes that ship platform specific native builds. */
const nativeScopes = new Set(['@img', '@next', '@esbuild', '@swc', '@rollup', '@parcel']);

/** Unscoped native packages, matched by the platform suffix they carry. */
const nativePrefixes = ['lightningcss-', 'sharp-'];

/** `sharp-linux-arm64`, `swc-win32-x64-msvc`, `sharp-libvips-darwin-x64`. */
const platformTarget = /(?:^|-)(?:darwin|linux|linuxmusl|freebsd|android|win32|arm64|arm|riscv64|wasm32)(?:-|$)/;

function splitPackageName(entry: string): { scope: string; name: string } | undefined {
  const decoded = entry.replace(/\+/g, '/').replace(/@[^/@]*$/, '');
  const parts = decoded.split('/').filter(Boolean);
  return parts.length === 2 ? { scope: parts[0], name: parts[1] } : undefined;
}

/**
 * True only for native packages built for some platform other than win32-x64.
 * Names without a platform suffix (`@next/env`, `@swc/helpers`, `sharp`) are
 * never touched, so this cannot trim regular dependencies.
 */
function isForeignNative(entry: string): boolean {
  const parsed = splitPackageName(entry);
  const name = parsed ? parsed.name : entry;
  const isNative = parsed ? nativeScopes.has(parsed.scope) : nativePrefixes.some((prefix) => name.startsWith(prefix));
  if (!isNative || !platformTarget.test(name)) return false;
  return !name.includes('win32-x64');
}

/** Deletes a staged copy. Staged trees only hold real files and directories
 *  (the copy above dereferences links), but a link is unlinked instead of
 *  followed so that a stray junction can never take its target with it. */
async function removeCopy(target: string) {
  if (lstatSync(target).isSymbolicLink()) unlinkSync(target);
  else await rm(target, { recursive: true, force: true });
}

function directorySize(directory: string): number {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) total += directorySize(full);
    else if (entry.isFile()) total += statSync(full).size;
  }
  return total;
}

/**
 * Walks the staged tree looking for package entries (`node_modules/<name>`,
 * `node_modules/@scope/<name>` and the pnpm store spellings `.pnpm/<name>@<v>`
 * as well as `.pnpm/node_modules/<name>`), and drops the foreign-platform
 * ones. Directories that merely live inside a package are not package entries
 * and are left alone.
 */
async function pruneForeignNatives(directory: string) {
  let removed = 0;
  let bytes = 0;
  const visit = async (current: string): Promise<void> => {
    const parent = basename(current);
    const isPackageArea =
      parent === 'node_modules' ||
      parent === '.pnpm' ||
      (parent.startsWith('@') && basename(dirname(current)) === 'node_modules');
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = join(current, entry.name);
      if (isPackageArea) {
        const qualified = parent.startsWith('@') ? `${parent}/${entry.name}` : entry.name;
        if (isForeignNative(qualified)) {
          bytes += directorySize(full);
          await removeCopy(full);
          removed += 1;
          continue;
        }
      }
      await visit(full);
    }
  };
  await visit(directory);
  return { removed, bytes };
}

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function packageKey(directory: string): Promise<string | undefined> {
  const manifest = join(directory, 'package.json');
  if (!existsSync(manifest)) return undefined;
  try {
    const parsed = JSON.parse(await readFile(manifest, 'utf8')) as { name?: unknown; version?: unknown };
    return typeof parsed.name === 'string' && typeof parsed.version === 'string'
      ? `${parsed.name}@${parsed.version}`
      : undefined;
  } catch {
    return undefined;
  }
}

async function collectPackages(nodeModules: string): Promise<{ name: string; path: string }[]> {
  const found: { name: string; path: string }[] = [];
  for (const entry of await readdir(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const full = join(nodeModules, entry.name);
    if (entry.name.startsWith('@')) {
      for (const child of await readdir(full, { withFileTypes: true })) {
        if (child.isDirectory()) found.push({ name: `${entry.name}/${child.name}`, path: join(full, child.name) });
      }
    } else {
      found.push({ name: entry.name, path: full });
    }
  }
  return found;
}

/**
 * Removes package copies Node would never reach: an entry is redundant when a
 * directory further up the resolution chain already provides the very same
 * name and version. Different versions are always kept, so semver conflicts
 * keep working.
 */
async function collapseDuplicates(nodeModules: string, visible: Map<string, string>) {
  let removed = 0;
  let bytes = 0;
  const kept: { name: string; path: string }[] = [];

  for (const pkg of await collectPackages(nodeModules)) {
    const key = await packageKey(pkg.path);
    if (key && visible.has(key)) {
      bytes += directorySize(pkg.path);
      await removeCopy(pkg.path);
      removed += 1;
      continue;
    }
    if (key) visible.set(key, pkg.path);
    kept.push(pkg);
  }

  for (const pkg of kept) {
    const nested = join(pkg.path, 'node_modules');
    if (!existsSync(nested)) continue;
    const result = await collapseDuplicates(nested, visible);
    removed += result.removed;
    bytes += result.bytes;
  }

  // The pnpm virtual store (`.pnpm`) is deliberately left untouched: Next's
  // build output references `.pnpm/<pkg>@<version>/node_modules/...` paths
  // directly (118 files do), so those copies have to stay even where a
  // shallower directory would resolve to the very same package.

  return { removed, bytes, visible };
}

async function collapseStagedDuplicates(appRoot: string) {
  // The two trees the script stages are the traced standalone tree
  // (`app/web/node_modules`, which holds the pnpm store) and the wholesale
  // copy of the app's own node_modules (`app/web/apps/web/node_modules`).
  // Entries are only dropped when the identical name@version is already
  // available in a directory the resolver reaches first.
  const standalone = await collapseDuplicates(join(appRoot, 'node_modules'), new Map<string, string>());
  const wholesale = await collapseDuplicates(
    join(appRoot, 'apps', 'web', 'node_modules'),
    new Map(standalone.visible),
  );
  return { removed: standalone.removed + wholesale.removed, bytes: standalone.bytes + wholesale.bytes };
}

async function main() {
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });

  run('pnpm', ['--filter', '@openvitals/web', 'build']);
  run('pnpm', ['--filter', '@openvitals/ingestion-worker', 'build']);
  run('pnpm', ['exec', 'tsup', 'packages/database/src/seed/run.ts', '--format', 'cjs', '--target', 'node22', '--out-dir', 'desktop-runtime/app/bootstrap', '--clean']);

  await copyRequired(join(root, 'apps', 'web', '.next', 'standalone'), join(staging, 'app', 'web'));
  await copyRequired(
    join(root, 'apps', 'web', 'node_modules'),
    join(staging, 'app', 'web', 'apps', 'web', 'node_modules'),
  );
  // Next resolves this helper outside its traced standalone dependency graph.
  await copyRequired(
    join(root, 'apps', 'web', 'node_modules', '@swc', 'helpers'),
    join(staging, 'app', 'web', 'apps', 'web', 'node_modules', '@swc', 'helpers'),
  );
  await copyRequired(join(root, 'apps', 'web', '.next', 'static'), join(staging, 'app', 'web', 'apps', 'web', '.next', 'static'));
  await copyRequired(join(root, 'apps', 'web', 'public'), join(staging, 'app', 'web', 'apps', 'web', 'public'));
  await copyRequired(join(root, 'services', 'ingestion-worker', 'dist'), join(staging, 'app', 'worker'));
  await writeFile(join(staging, 'app', 'worker', 'package.json'), '{"type":"module"}\n', 'utf8');
  await copyRequired(join(root, 'packages', 'database', 'drizzle'), join(staging, 'app', 'migrations'));

  const trimmed = await pruneForeignNatives(join(staging, 'app'));
  const collapsed = await collapseStagedDuplicates(join(staging, 'app', 'web'));
  console.log(
    `[prepare-runtime] dropped ${trimmed.removed} foreign-platform native packages (${formatMegabytes(trimmed.bytes)})`,
  );
  console.log(
    `[prepare-runtime] collapsed ${collapsed.removed} redundant package copies (${formatMegabytes(collapsed.bytes)})`,
  );

  // Keep only the PostgreSQL server runtime. Never package the build machine's
  // data cluster, pgAdmin profile, installer, documentation, or credentials.
  for (const directory of ['bin', 'lib', 'share']) {
    await copyRequired(join(postgresSource, directory), join(staging, 'postgres', directory));
  }
}

void main();
