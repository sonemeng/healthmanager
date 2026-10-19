/**
 * ingestion-worker 的 HTTP 通道（Bearer 鉴权，与 importJobs.triggerWorker 同款）。
 *
 * 为什么区间重算要绕到 worker 做：`resolveReferenceRange` 在 `@openvitals/ingestion`，
 * 而 apps/web 并不依赖它（加依赖会把 worker 的编译链拖进纯前端包）。走 HTTP 保证
 * 「重算」全仓只有一份实现——web 与 worker 各写一套口径，正是 spec 21 §4.6 说的
 * 「闸门半年后变垃圾桶」的成因。
 */

/** worker `RecomputeResult` 的镜像（字段以 services/ingestion-worker/src/steps/recompute.ts 为准） */
export interface RecomputeResult {
  scanned: number;
  skippedExisting: number;
  resolved: number;
  stillGated: number;
  exempted: number;
  missingMetric: number;
  released: number;
  /** 实际写回库的行数（含「只清掉幽灵 gateReason」这种区间没变的行） */
  changed: number;
}

export type RecomputeOutcome =
  | { ok: true; result: RecomputeResult }
  | { ok: false; error: string };

export interface RecomputeRequest {
  userId: string;
  /** 指定行（改挂指标后用）。与 importJobId 至少给一个 */
  observationIds?: string[];
  /** 指定任务（处理完学习行 / 打开任务时整单自愈） */
  importJobId?: string;
  /**
   * 是否连「已有区间」的行一起重算。默认 false：
   * 库里已存的区间可能来自报告原文（优先级 1），重算会把它覆盖成字典区间——那是数据损失
   * 不是自愈。只有明确知道旧区间已失效（改挂指标）时才置 true。
   */
  includeExisting?: boolean;
}

export async function requestRangeRecompute(
  params: RecomputeRequest,
): Promise<RecomputeOutcome> {
  const workerUrl = process.env.RENDER_WORKER_URL ?? 'http://localhost:4000';
  const webhookSecret = process.env.RENDER_WEBHOOK_SECRET ?? 'dev-secret-change-me';

  try {
    const response = await fetch(`${workerUrl}/api/ranges/recompute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${webhookSecret}`,
      },
      body: JSON.stringify(params),
      // 本地回环，但 worker 可能正在跑长任务（解析大文件）——不能无限等
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, error: `HTTP ${response.status}${body ? `: ${body}` : ''}` };
    }
    return { ok: true, result: (await response.json()) as RecomputeResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[worker] range recompute failed:', message);
    return { ok: false, error: message };
  }
}
