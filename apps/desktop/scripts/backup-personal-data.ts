import { access, cp, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const appData = process.env.APPDATA;
if (!appData) throw new Error('APPDATA is unavailable.');

const source = join(appData, '@openvitals', 'desktop');
const output = resolve(process.cwd(), 'release-personal');
const staging = join(output, 'HealthManager++-Personal-Data');

async function main() {
  await access(source);
  await rm(staging, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(source, staging, { recursive: true, dereference: true });

  const archive = join(output, 'HealthManager++-Personal-Data-Backup.zip');
  await rm(archive, { force: true });
  const result = spawnSync('tar', ['-a', '-c', '-f', archive, '-C', output, 'HealthManager++-Personal-Data'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error('Failed to create personal-data backup archive.');
  await rm(staging, { recursive: true, force: true });
}

void main();
