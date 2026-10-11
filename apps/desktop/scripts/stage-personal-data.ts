import { access, cp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const appData = process.env.APPDATA;
if (!appData) throw new Error('APPDATA is unavailable.');

const source = join(appData, '@openvitals', 'desktop', 'data');
const destination = resolve(process.cwd(), '..', '..', 'desktop-runtime', 'app', 'personal-data', 'data');

async function main() {
  await access(join(source, 'postgres', 'PG_VERSION'));
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, dereference: true });
}

void main().catch(async (error) => {
  await rm(destination, { recursive: true, force: true });
  throw error;
});
