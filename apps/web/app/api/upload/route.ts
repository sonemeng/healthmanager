import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { auth } from '@/server/auth';
import { headers } from 'next/headers';
import { createBlobStorage } from '@openvitals/blob-storage';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@openvitals/common';

function detectMimeType(file: File) {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'text/markdown';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return '';
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const mimeType = detectMimeType(file);
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type || file.name}` }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = createHash('sha256').update(buffer).digest('hex');
  const blobPath = `uploads/${session.user.id}/${contentHash}/${file.name}`;

  const storage = createBlobStorage();
  const result = await storage.upload({
    path: blobPath,
    data: buffer,
    contentType: mimeType,
  });

  return NextResponse.json({ blobPath: result.path, contentHash, mimeType });
}
