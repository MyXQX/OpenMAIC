import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getUserIdFromSessionToken, SESSION_COOKIE_NAME } from '@/lib/wulian/auth/session';
import { readProfile, writeProfile } from '@/lib/wulian/storage';
import type { StudentProfile } from '@/lib/wulian/types';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const userId = await getUserIdFromSessionToken(sessionToken);

    if (!userId) {
      // 访客直接返回空，由前端本地读取
      return apiSuccess({ profile: null });
    }

    const profile = await readProfile(userId);
    return apiSuccess({ profile });
  } catch (err) {
    console.error('[wulian/profile GET] failed:', err);
    return apiError(
      'INTERNAL_ERROR',
      500,
      err instanceof Error ? err.message : '获取学生画像失败'
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const userId = await getUserIdFromSessionToken(sessionToken);

    if (!userId) {
      return apiError('INVALID_CREDENTIALS', 401, '请先登录以保存学生画像');
    }

    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return apiError('INVALID_REQUEST', 400, '请求体非法');
    }

    const profile: StudentProfile = {
      userId,
      gradeOrMajor: body.gradeOrMajor,
      level: body.level || 'beginner',
      goals: body.goals || [],
      pacePreference: body.pacePreference,
      preferredScientistTone: body.preferredScientistTone,
      updatedAt: Date.now(),
    };

    await writeProfile(profile);
    return apiSuccess({ profile });
  } catch (err) {
    console.error('[wulian/profile PUT] failed:', err);
    return apiError(
      'INTERNAL_ERROR',
      500,
      err instanceof Error ? err.message : '保存学生画像失败'
    );
  }
}
