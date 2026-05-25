/**
 * app/api/health/route.ts
 * 
 * 文件作用：
 * 应用健康检查端点。返回应用的运行状态和可用功能列表。用于监控应用是否正常运行，
 * 以及检查各种内容生成功能（网络搜索、图像生成、视频生成、TTS等）是否可用。
 * 
 * 运行机理：
 * 1. 状态检查：
 *    - 返回基本状态 status: 'ok'
 *    - 包含应用版本号（从 npm_package_version 环境变量获取）
 * 2. 功能可用性检查：
 *    - webSearch：检查是否配置了网络搜索提供者
 *    - imageGeneration：检查是否配置了图像生成提供者
 *    - videoGeneration：检查是否配置了视频生成提供者
 *    - tts：检查是否配置了文本转语音提供者
 * 3. 提供者检查：
 *    - 调用 getServerWebSearchProviders() 等函数
 *    - 通过检查提供者对象的键数量来判断是否有可用提供者
 * 4. 响应格式：
 *    - 返回 JSON 响应，包含状态、版本和功能可用性
 * \n * 与其他代码的关联：
 * - getServerWebSearchProviders (lib/server/provider-config)：获取配置的网络搜索提供者\n * - getServerImageProviders (lib/server/provider-config)：获取配置的图像生成提供者
 * - getServerVideoProviders (lib/server/provider-config)：获取配置的视频生成提供者
 * - getServerTTSProviders (lib/server/provider-config)：获取配置的TTS提供者
 * - apiSuccess (lib/server/api-response)：标准化成功响应
 * - 前端应用启动时调用此端点进行初始化检查
 */

import { apiSuccess } from '@/lib/server/api-response';
import {
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';

const version = process.env.npm_package_version || '0.1.0';

export async function GET() {
  return apiSuccess({
    status: 'ok',
    version,
    capabilities: {
      webSearch: Object.keys(getServerWebSearchProviders()).length > 0,
      imageGeneration: Object.keys(getServerImageProviders()).length > 0,
      videoGeneration: Object.keys(getServerVideoProviders()).length > 0,
      tts: Object.keys(getServerTTSProviders()).length > 0,
    },
  });
}
