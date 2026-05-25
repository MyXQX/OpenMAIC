/**
 * app/api/server-providers/route.ts
 * 
 * 文件作用：
 * 服务器端提供者配置API端点。返回服务器上配置的所有内容生成提供者列表，包括
 * LLM、图像生成、视频生成、文本转语音、语音识别、PDF解析和网络搜索提供者。
 * 前端在启动时调用此接口以获取可用的提供者选项。
 * 
 * 运行机理：
 * 1. 提供者获取：
 *    - 调用 getServerProviders() 获取通用LLM提供者列表
 *    - 调用 getServerTTSProviders() 获取文本转语音提供者
 *    - 调用 getServerASRProviders() 获取自动语音识别提供者
 *    - 调用 getServerPDFProviders() 获取PDF解析提供者
 *    - 调用 getServerImageProviders() 获取图像生成提供者
 *    - 调用 getServerVideoProviders() 获取视频生成提供者
 *    - 调用 getServerWebSearchProviders() 获取网络搜索提供者
 * 2. 配置来源：
 *    - 环境变量：OPENAI_API_KEY、ANTHROPIC_API_KEY 等
 *    - 配置文件或数据库中的提供者设置
 *    - 每个提供者包含ID、名称、描述等元数据
 * 3. 响应格式：
 *    - 返回包含所有提供者类型的对象
 *    - 每个提供者类型包含提供者ID和配置信息
 * 4. 用途：
 *    - 前端初始化时获取可用提供者
 *    - 用户选择提供者时显示选项列表
 *    - 配置表单中的默认值和下拉菜单选项
 * 
 * 与其他代码的关联：
 * - getServerProviders (lib/server/provider-config)：获取LLM提供者
 * - getServerTTSProviders (lib/server/provider-config)：获取TTS提供者
 * - getServerASRProviders (lib/server/provider-config)：获取ASR提供者
 * - getServerPDFProviders (lib/server/provider-config)：获取PDF提供者
 * - getServerImageProviders (lib/server/provider-config)：获取图像提供者
 * - getServerVideoProviders (lib/server/provider-config)：获取视频提供者
 * - getServerWebSearchProviders (lib/server/provider-config)：获取网络搜索提供者
 * - apiSuccess (lib/server/api-response)：标准化API响应
 * - useSettingsStore (lib/store/settings)：前端使用此接口初始化提供者选项
 */

import {
  getServerProviders,
  getServerTTSProviders,
  getServerASRProviders,
  getServerPDFProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerWebSearchProviders,
} from '@/lib/server/provider-config';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('ServerProviders');

export async function GET() {
  try {
    return apiSuccess({
      providers: getServerProviders(),
      tts: getServerTTSProviders(),
      asr: getServerASRProviders(),
      pdf: getServerPDFProviders(),
      image: getServerImageProviders(),
      video: getServerVideoProviders(),
      webSearch: getServerWebSearchProviders(),
    });
  } catch (error) {
    log.error('Error fetching server providers:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
