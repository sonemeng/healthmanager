import { cp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

  // Keep only the PostgreSQL server runtime. Never package the build machine's
  // data cluster, pgAdmin profile, installer, documentation, or credentials.
  for (const directory of ['bin', 'lib', 'share']) {
    await copyRequired(join(postgresSource, directory), join(staging, 'postgres', directory));
  }
}

void main();
