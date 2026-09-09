import type { BlobStorageProvider } from './interface';
import { VercelBlobAdapter } from './vercel';
import { LocalFSAdapter } from './local';

export type { BlobStorageProvider };
export { VercelBlobAdapter, LocalFSAdapter };

export function createBlobStorage(): BlobStorageProvider {
  switch (process.env.BLOB_STORAGE_PROVIDER) {
    case 'vercel':
      return new VercelBlobAdapter();
    case 'local':
      return new LocalFSAdapter();
    default:
      return new VercelBlobAdapter();
  }
}
