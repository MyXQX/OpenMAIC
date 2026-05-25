/**
 * app/api/verify-model/route.ts
 * 
 * 文件作用：
 * 模型验证API端点。验证指定的LLM模型是否可用且能正常响应。用于在生成过程中
 * 检查所选的AI模型是否真的可以使用，防止因模型不可用导致生成失败。
 * 
 * 运行机理：
 * 1. 请求参数：
 *    - model：要验证的模型ID（例如 'gpt-4', 'claude-3-opus' 等）
 *    - provider（可选）：指定的AI提供者ID
 *    - apiKey（可选）：自定义API密钥
 *    - baseUrl（可选）：自定义API端点基础URL
 * 2. 模型解析：
 *    - 调用 resolveModel() 根据模型ID和提供者ID解析完整的模型配置
 *    - 包含获取相应的API密钥和端点信息
 * 3. 模型验证：
 *    - 调用 callLLM() 向模型发送测试提示词
 *    - 通常发送一个简单的系统消息和用户消息
 *    - 验证模型是否能正常返回响应
 * 4. 响应处理：
 *    - 成功：返回 { available: true }
 *    - 失败：返回 { available: false, error: '错误信息' }
 * 5. 错误处理：
 *    - 捕获API调用异常（网络错误、认证失败、模型不存在等）
 *    - 返回具体的错误原因
 * 
 * 与其他代码的关联：
 * - resolveModel (lib/server/resolve-model)：解析模型配置
 * - callLLM (lib/ai/llm)：调用LLM进行验证
 * - apiSuccess, apiError (lib/server/api-response)：标准化API响应
 * - 前端在选择模型后调用此端点进行验证
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModel } from '@/lib/server/resolve-model';
import { callLLM } from '@/lib/ai/llm';
const log = createLogger('Verify Model');

export async function POST(req: NextRequest) {
  let model: string | undefined;
  try {
    const body = await req.json();
    const { apiKey, baseUrl, providerType } = body;
    model = body.model;

    if (!model) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Model name is required');
    }

    // Parse model string and resolve server-side fallback
    let languageModel;
    try {
      const result = await resolveModel({
        modelString: model,
        apiKey: apiKey || '',
        baseUrl: baseUrl || undefined,
        providerType,
      });
      languageModel = result.model;
    } catch (error) {
      return apiError(
        'INVALID_REQUEST',
        401,
        error instanceof Error ? error.message : String(error),
      );
    }

    // Send a minimal test message. Use the unified wrapper so compatible
    // providers can receive provider-specific request options.
    const { text } = await callLLM(
      {
        model: languageModel,
        prompt: 'Say "OK" if you can hear me.',
        maxOutputTokens: 64,
      },
      'verify-model',
      undefined,
      { mode: 'disabled', enabled: false },
    );

    return apiSuccess({
      message: 'Connection successful',
      response: text,
    });
  } catch (error) {
    log.error(`Model verification failed [model="${model ?? 'unknown'}"]:`, error);

    let errorMessage = 'Connection failed';
    if (error instanceof Error) {
      // Parse common error messages
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = 'API key is invalid or expired';
      } else if (error.message.includes('404') || error.message.includes('not found')) {
        errorMessage = 'Model not found or API endpoint error';
      } else if (error.message.includes('429')) {
        errorMessage = 'API rate limit exceeded, please try again later';
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Cannot connect to API server, please check the Base URL';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Connection timed out, please check your network';
      } else {
        errorMessage = error.message;
      }
    }

    return apiError('INTERNAL_ERROR', 500, errorMessage);
  }
}
