/**
 * app/api/classroom/route.ts
 * 
 * 文件作用：
 * 课堂数据管理API端点。支持POST和GET两个操作：POST用于保存生成的课堂数据到服务器，
 * GET用于从服务器检索已保存的课堂数据。这是课堂持久化的核心接口。
 * 
 * 运行机理：
 * 1. POST 请求（保存课堂）：
 *    - 接收请求体中的 stage（课堂数据）和 scenes（场景数组）
 *    - 生成唯一的课堂ID（stageId）
 *    - 调用 persistClassroom() 将课堂数据保存到存储（可能是数据库或文件系统）
 *    - 返回成功响应，包含课堂ID和场景计数
 * 2. GET 请求（获取课堂）：
 *    - 从查询参数或请求头中获取课堂ID
 *    - 调用 readClassroom() 从存储中读取课堂数据
 *    - 返回课堂的 stage 和 scenes 数据
 * 3. 错误处理：
 *    - 验证课堂ID的有效性（isValidClassroomId）
 *    - 处理存储操作失败的情况
 *    - 返回对应的错误代码和消息
 * 4. 日志记录：
 *    - 所有操作都通过 createLogger('Classroom API') 记录
 * 
 * 与其他代码的关联：
 * - persistClassroom (lib/server/classroom-storage)：保存课堂数据
 * - readClassroom (lib/server/classroom-storage)：读取课堂数据
 * - isValidClassroomId (lib/server/classroom-storage)：验证课堂ID有效性
 * - buildRequestOrigin (lib/server/classroom-storage)：构建请求来源
 * - apiSuccess, apiError (lib/server/api-response)：标准化API响应
 * - app/classroom/[id]/page.tsx：前端通过此API获取课堂数据
 */

import { type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  buildRequestOrigin,
  isValidClassroomId,
  persistClassroom,
  readClassroom,
} from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('Classroom API');

export async function POST(request: NextRequest) {
  let stageId: string | undefined;
  let sceneCount: number | undefined;
  try {
    const body = await request.json();
    const { stage, scenes } = body;
    stageId = stage?.id;
    sceneCount = scenes?.length;

    if (!stage || !scenes) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: stage, scenes',
      );
    }

    const id = stage.id || randomUUID();
    const baseUrl = buildRequestOrigin(request);

    const persisted = await persistClassroom({ id, stage: { ...stage, id }, scenes }, baseUrl);

    return apiSuccess({ id: persisted.id, url: persisted.url }, 201);
  } catch (error) {
    log.error(
      `Classroom storage failed [stageId=${stageId ?? 'unknown'}, scenes=${sceneCount ?? 0}]:`,
      error,
    );
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to store classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required parameter: id',
      );
    }

    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const classroom = await readClassroom(id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    return apiSuccess({ classroom });
  } catch (error) {
    log.error(
      `Classroom retrieval failed [id=${request.nextUrl.searchParams.get('id') ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to retrieve classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}
