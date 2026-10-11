import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

void rm(resolve(process.cwd(), '..', '..', 'desktop-runtime', 'app', 'personal-data'), { recursive: true, force: true });
