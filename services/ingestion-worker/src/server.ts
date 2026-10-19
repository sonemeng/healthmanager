import { createServer, IncomingMessage, ServerResponse } from 'http';
import './env';

// The workflow imports the shared database client, so load it only after env.ts
// has populated DATABASE_URL for local worker processes.
const { processWorkflow } = await import('./workflow');
const { recomputeObservationRanges } = await import('./steps/recompute');

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const WEBHOOK_SECRET = process.env.RENDER_WEBHOOK_SECRET ?? 'dev-secret-change-me';

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { status: 'ok' });
  }

  // Workflow trigger
  if (req.method === 'POST' && req.url === '/api/workflows/trigger') {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      return json(res, 401, { error: 'unauthorized' });
    }

    try {
      const body = JSON.parse(await parseBody(req));
      const { importJobId, artifactId, userId } = body;

      if (!importJobId || !artifactId || !userId) {
        return json(res, 400, { error: 'Missing required fields: importJobId, artifactId, userId' });
      }

      // Start workflow processing in the background
      processWorkflow({ importJobId, artifactId, userId }).catch((err) => {
        console.error('[workflow] Unhandled error:', err);
      });

      return json(res, 202, { started: true });
    } catch (err) {
      console.error('[trigger] Parse error:', err);
      return json(res, 400, { error: 'Invalid request body' });
    }
  }

  // 区间重算（spec 21 §4.6）：只重跑 resolveReferenceRange + 判读，不碰值与单位。
  // spec 21 S2 起 web 侧「改挂指标」会同步调它；S3 的存量清幽灵与任务自愈共用同一实现。
  if (req.method === 'POST' && req.url === '/api/ranges/recompute') {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      return json(res, 401, { error: 'unauthorized' });
    }

    try {
      const body = JSON.parse(await parseBody(req));
      const { userId, observationIds, importJobId, includeExisting } = body;

      if (!userId || (!Array.isArray(observationIds) && !importJobId)) {
        return json(res, 400, {
          error: 'Missing required fields: userId, and observationIds or importJobId',
        });
      }

      const result = await recomputeObservationRanges({
        userId,
        observationIds: Array.isArray(observationIds) ? observationIds : undefined,
        importJobId: typeof importJobId === 'string' ? importJobId : undefined,
        includeExisting: includeExisting === true,
      });
      return json(res, 200, result);
    } catch (err) {
      console.error('[recompute] Failed:', err);
      return json(res, 500, { error: err instanceof Error ? err.message : 'recompute failed' });
    }
  }

  json(res, 404, { error: 'not found' });
});
server.listen(PORT, () => {
  console.log(`[ingestion-worker] Listening on port ${PORT}`);
});
