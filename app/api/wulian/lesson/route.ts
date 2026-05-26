/**
 * GET /api/wulian/lesson?id=<chapterId>
 *
 * 返回章节配置 + 主讲科学家 persona + 状态。
 * 不带 id 时返回全部章节列表。
 */

import type { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { getChapter, loadAllChapters } from '@/lib/wulian/agents/chapter';
import { getPersona, loadAllPersonas } from '@/lib/wulian/agents/persona';

const log = createLogger('Wulian Lesson API');

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  try {
    if (!id) {
      const chapters = await loadAllChapters();
      const personas = await loadAllPersonas();
      const list = chapters.map((c) => ({
        id: c.id,
        title: c.title,
        subject: c.subject,
        summary: c.summary,
        status: c.status,
        primaryScientist: personas.get(c.primaryScientist) ?? null,
      }));
      return apiSuccess({ chapters: list });
    }

    const chapter = await getChapter(id);
    if (!chapter) return apiError('INVALID_REQUEST', 404, `Chapter not found: ${id}`);

    const teacher = await getPersona(chapter.primaryScientist);
    if (!teacher) return apiError('INVALID_REQUEST', 500, `Scientist not found: ${chapter.primaryScientist}`);

    const secondary = chapter.secondaryScientist
      ? await getPersona(chapter.secondaryScientist)
      : null;

    return apiSuccess({
      chapter,
      teacher,
      secondary,
      agents: [
        { role: 'teacher', scientistId: teacher.id, displayName: `${teacher.name} 教授` },
        { role: 'assistant', displayName: '小麦 助教' },
        { role: 'classmate', displayName: '小恒 同学' },
      ],
    });
  } catch (err) {
    log.error('lesson GET failed:', err);
    return apiError(
      'INTERNAL_ERROR',
      500,
      err instanceof Error ? err.message : 'Failed to load lesson',
    );
  }
}
