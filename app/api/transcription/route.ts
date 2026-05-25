/**
 * app/api/transcription/route.ts
 * 
 * 文件作用：
 * 处理音频转文字的API端点。接收上传的音频文件，调用配置的ASR提供者（如OpenAI Whisper、
 * 浏览器内置ASR等）进行转录，返回识别文本。
 * 
 * 运行机理：
 * 1. 请求处理：
 *    - 接收FormData格式的请求，包含：
 *      - audio：音频文件（File对象）
 *      - providerId：ASR提供者ID（如'openai-whisper'）
 *      - modelId：特定模型ID（可选）
 *      - language：语言代码（如'zh'、'en'，'auto'为自动检测）
 *      - apiKey：提供者API密钥（可选，从服务器配置读取）
 *      - baseUrl：自定义API端点基础URL（可选）
 * 2. 提供者解析：
 *    - 如果没有传入providerId，默认使用'openai-whisper'
 *    - 调用 resolveASRApiKey() 和 resolveASRBaseUrl() 从环境变量获取配置
 * 3. 安全检查：
 *    - 如果提供了自定义baseUrl，在生产环境进行SSRF检查
 *    - SSRF防护：防止恶意指向内网或本地服务
 * 4. 转录执行：
 *    - 调用 transcribeAudio() 通过选定的ASR提供者转录音频
 *    - 返回识别的文本内容
 * 5. 响应：
 *    - 成功：返回 {text: "转录的文本"}
 *    - 失败：返回错误信息和状态码
 * 
 * 与其他代码的关联：
 * - transcribeAudio (lib/audio/asr-providers)：调用具体的ASR提供者
 * - resolveASRApiKey/resolveASRBaseUrl (lib/server/provider-config)：从环保或配置读取
 * - 支持的ASR提供者：OpenAI Whisper、浏览器内置ASR等
 * - 客户端通过 useAudioRecorder() hook 或类似的API调用此端点
 */

import { NextRequest } from 'next/server';
import { transcribeAudio } from '@/lib/audio/asr-providers';
import { resolveASRApiKey, resolveASRBaseUrl } from '@/lib/server/provider-config';
import type { ASRProviderId } from '@/lib/audio/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
const log = createLogger('Transcription');

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let resolvedProviderId: string | undefined;
  let resolvedModelId: string | undefined;
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    const providerId = formData.get('providerId') as ASRProviderId | null;
    const modelId = formData.get('modelId') as string | null;
    const language = formData.get('language') as string | null;
    const apiKey = formData.get('apiKey') as string | null;
    const baseUrl = formData.get('baseUrl') as string | null;

    if (!audioFile) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Audio file is required');
    }

    // providerId is required from the client — no server-side store to fall back to
    const effectiveProviderId = providerId || ('openai-whisper' as ASRProviderId);
    resolvedProviderId = effectiveProviderId;
    resolvedModelId = modelId ?? undefined;

    const clientBaseUrl = baseUrl || undefined;
    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = await validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const config = {
      providerId: effectiveProviderId,
      modelId: modelId || undefined,
      language: language || 'auto',
      apiKey: clientBaseUrl
        ? apiKey || ''
        : resolveASRApiKey(effectiveProviderId, apiKey || undefined),
      baseUrl: clientBaseUrl
        ? clientBaseUrl
        : resolveASRBaseUrl(effectiveProviderId, baseUrl || undefined),
    };

    // Transcribe using the provider system
    const result = await transcribeAudio(config, audioFile);

    return apiSuccess({ text: result.text });
  } catch (error) {
    log.error(
      `Transcription failed [provider=${resolvedProviderId ?? 'unknown'}, model=${resolvedModelId ?? 'default'}]:`,
      error,
    );
    return apiError(
      'TRANSCRIPTION_FAILED',
      500,
      'Transcription failed',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
