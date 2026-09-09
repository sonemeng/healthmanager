import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `tsx --env-file` is not reliable under the Windows Turbo dev process.
// Load local development values before importing modules that create DB clients.
const envPath = resolve(process.cwd(), '.env');

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const entry = line.trim();
    if (!entry || entry.startsWith('#')) continue;

    const separator = entry.indexOf('=');
    if (separator === -1) continue;

    const key = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
