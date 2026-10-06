import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { headers } from 'next/headers';
import { getDb } from '@openvitals/database/client';
import { importJobs, sourceArtifacts } from '@openvitals/database';
import { createBlobStorage } from '@openvitals/blob-storage';
import { getActiveProfileId } from '@/server/trpc/active-profile';

// GET /api/artifacts/[id] — 原始上传文件的鉴权读取（详情页「原图对照」用）
//
// 权限模型（严格版，跨成员不可见）：
//   401 未登录
//   404 文件不存在或不属于当前账号（不泄露他人文件的存在性）
//   403 文件存在但属于其他成员档案（当前激活档案无权查看）
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = getDb();

  // ① 文件必须属于当前账号（join import_jobs 拿 profileId）
  const [row] = await db
    .select({
      id: sourceArtifacts.id,
      userId: sourceArtifacts.userId,
      blobPath: sourceArtifacts.blobPath,
      mimeType: sourceArtifacts.mimeType,
      fileName: sourceArtifacts.fileName,
      profileId: importJobs.profileId,
    })
    .from(sourceArtifacts)
    .leftJoin(importJobs, eq(importJobs.sourceArtifactId, sourceArtifacts.id))
    .where(and(eq(sourceArtifacts.id, id), eq(sourceArtifacts.userId, userId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // ② 严格版：只允许查看当前激活成员档案的报告原图
  const activeProfileId = await getActiveProfileId(userId);
  if (activeProfileId && row.profileId && row.profileId !== activeProfileId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ③ 读取 blob（local 适配器 download 的 contentType 是硬编码 octet-stream，
  //    因此这里用 DB 记录的 mimeType 作为响应 Content-Type）
  try {
    const storage = createBlobStorage();
    const { data } = await storage.download(row.blobPath);
    const buffer = Buffer.from(await new Response(data).arrayBuffer());

    const disposition = `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': row.mimeType || 'application/octet-stream',
        'Content-Disposition': disposition,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    console.error(`[api/artifacts] blob read failed for ${id}:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
