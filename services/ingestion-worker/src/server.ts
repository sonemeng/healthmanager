import { createServer, IncomingMessage, ServerResponse } from 'http';
import './env';

// The workflow imports the shared database client, so load it only after env.ts
// has populated DATABASE_URL for local worker processes.
const { processWorkflow } = await import('./workflow');

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

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`[ingestion-worker] Listening on port ${PORT}`);
});
