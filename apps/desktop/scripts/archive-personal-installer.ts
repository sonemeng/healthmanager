import { mkdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const release = join(root, 'release');
const personalRelease = join(root, 'release-personal');
const version = process.env.npm_package_version;
if (!version) throw new Error('Package version is unavailable.');

async function main() {
  await mkdir(personalRelease, { recursive: true });
  // The personal bundle is a ZIP: makensis cannot open the deep pnpm paths of
  // this payload (portable target aborts on `File: failed opening file`), while
  // the zip target handles them, and unzipping gives the same runnable folder.
  const filename = `HealthManager++-Personal-${version}-x64.zip`;
  const destination = join(personalRelease, filename);
  await rm(destination, { force: true });
  await rename(join(release, filename), destination);
}

void main();
