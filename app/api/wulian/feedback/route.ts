/**
 * POST /api/wulian/feedback
 *
 * 收集学生的评分、quiz 答题结果、定性反馈。
 * 写入 data/wulian/feedback/<yyyymmdd>.jsonl，每行一条。
 */

import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { ensureDataDirs, FEEDBACK_DIR } from '@/lib/wulian/storage';

const log = createLogger('Wulian Feedback API');

interface FeedbackPayload {
  chapterId: string;
  type: 'quiz' | 'rating' | 'comment';
  payload: Record<string, unknown>;
}

function dailyFile(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return path.join(FEEDBACK_DIR, `${yyyy}${mm}${dd}.jsonl`);
}

export async function POST(req: NextRequest) {
  try {
    await ensureDataDirs();
    const body = (await req.json()) as FeedbackPayload;
    if (!body.chapterId || !body.type || !body.payload) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '缺少 chapterId / type / payload');
    }
    const entry = {
      id: nanoid(10),
      chapterId: body.chapterId,
      type: body.type,
      payload: body.payload,
      createdAt: Date.now(),
    };
    await fs.appendFile(dailyFile(), JSON.stringify(entry) + '\n', 'utf-8');
    log.info(`feedback ${body.type} for ${body.chapterId}`);
    return apiSuccess({ id: entry.id });
  } catch (err) {
    log.error('feedback failed:', err);
    return apiError('INTERNAL_ERROR', 500, err instanceof Error ? err.message : 'feedback failed');
  }
}
