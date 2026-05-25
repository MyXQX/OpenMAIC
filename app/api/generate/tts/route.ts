/**
 * app/api/generate/tts/route.ts
 * 
 * 文件作用：
 * 单条文本转语音（TTS）的API端点。根据文本内容和语音配置调用TTS提供者（Azure、OpenAI、VoxCPM等）
 * 生成语音音频。在场景生成后由客户端并行调用，为每个代理的发言生成配套的语音。
 * 
 * 运行机理：
 * 1. 请求体参数：
 *    - text：要转换的文本（必需）
 *    - audioId：音频片段的唯一ID（必需，用于跟踪）
 *    - ttsProviderId：TTS提供者ID（如'azure-tts'、'openai-tts'、'voxcpm'）
 *    - ttsVoice：声音ID或名称（必需）
 *    - ttsModelId：（可选）TTS模型ID
 *    - ttsSpeed：（可选）语速（如1.0表示正常速度）
 *    - ttsApiKey：（可选）提供者API密钥
 *    - ttsBaseUrl：（可选）自定义API端点
 *    - ttsProviderOptions：（可选）提供者特定的选项（如VoxCPM的voicePrompt）
 * 2. 验证：
 *    - browser-native-tts 必须在客户端处理，不支持在服务器端生成
 *    - VoxCPM的自动声音模式需要提供voicePrompt参数
 * 3. TTS生成：
 *    - 调用 generateTTS() 执行实际的语音生成
 *    - 返回base64编码的音频数据
 * 4. 支持的提供者：
 *    - Azure TTS：支持多语言和高质量声音
 *    - OpenAI TTS：支持多种声音和模型
 *    - VoxCPM：支持中文语音生成和声音克隆
 * 
 * 与其他代码的关联：
 * - generateTTS (lib/audio/tts-providers)：执行TTS生成的核心逻辑
 * - resolveTTSApiKey/resolveTTSBaseUrl (lib/server/provider-config)：获取TTS配置
 * - 课堂生成管道：在场景生成后调用此API为每个代理发言生成语音
 * - 环境变量：AZURE_TTS_KEY、OPENAI_API_KEY、VOXCPM_*等
 */

/**
 * Single TTS Generation API
 *
 * Generates TTS audio for a single text string and returns base64-encoded audio.
 * Called by the client in parallel for each speech action after a scene is generated.
 *
 * POST /api/generate/tts
 */

import { NextRequest } from 'next/server';
import { generateTTS } from '@/lib/audio/tts-providers';
import { resolveTTSApiKey, resolveTTSBaseUrl } from '@/lib/server/provider-config';
import type { TTSProviderId } from '@/lib/audio/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { VOXCPM_AUTO_VOICE_ID, VOXCPM_TTS_PROVIDER_ID } from '@/lib/audio/voxcpm';

const log = createLogger('TTS API');

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let ttsProviderId: string | undefined;
  let ttsVoice: string | undefined;
  let audioId: string | undefined;
  try {
    const body = await req.json();
    const { text, ttsModelId, ttsSpeed, ttsApiKey, ttsBaseUrl, ttsProviderOptions } = body as {
      text: string;
      audioId: string;
      ttsProviderId: TTSProviderId;
      ttsModelId?: string;
      ttsVoice: string;
      ttsSpeed?: number;
      ttsApiKey?: string;
      ttsBaseUrl?: string;
      ttsProviderOptions?: Record<string, unknown>;
    };
    ttsProviderId = body.ttsProviderId;
    ttsVoice = body.ttsVoice;
    audioId = body.audioId;

    // Validate required fields
    if (!text || !audioId || !ttsProviderId || !ttsVoice) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'Missing required fields: text, audioId, ttsProviderId, ttsVoice',
      );
    }

    // Reject browser-native TTS — must be handled client-side
    if (ttsProviderId === 'browser-native-tts') {
      return apiError('INVALID_REQUEST', 400, 'browser-native-tts must be handled client-side');
    }

    const voxcpmVoicePrompt =
      typeof ttsProviderOptions?.voicePrompt === 'string' ? ttsProviderOptions.voicePrompt : '';
    if (
      ttsProviderId === VOXCPM_TTS_PROVIDER_ID &&
      ttsVoice === VOXCPM_AUTO_VOICE_ID &&
      !voxcpmVoicePrompt.trim()
    ) {
      return apiError(
        'VOXCPM_AUTO_VOICE_REQUIRES_CONTEXT',
        400,
        'VoxCPM Auto Voice requires agent context',
      );
    }

    const clientBaseUrl = ttsBaseUrl || undefined;
    if (clientBaseUrl) {
      const ssrfError = await validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const apiKey = clientBaseUrl
      ? ttsApiKey || ''
      : resolveTTSApiKey(ttsProviderId, ttsApiKey || undefined);
    const baseUrl = clientBaseUrl
      ? clientBaseUrl
      : resolveTTSBaseUrl(ttsProviderId, ttsBaseUrl || undefined);

    // Build TTS config
    const config = {
      providerId: ttsProviderId as TTSProviderId,
      modelId: ttsModelId,
      voice: ttsVoice,
      speed: ttsSpeed ?? 1.0,
      apiKey,
      baseUrl,
      providerOptions: ttsProviderOptions,
    };

    log.info(
      `Generating TTS: provider=${ttsProviderId}, model=${ttsModelId || 'default'}, voice=${ttsVoice}, audioId=${audioId}, textLen=${text.length}`,
    );

    // Generate audio
    const { audio, format } = await generateTTS(config, text);

    // Convert to base64
    const base64 = Buffer.from(audio).toString('base64');

    return apiSuccess({ audioId, base64, format });
  } catch (error) {
    log.error(
      `TTS generation failed [provider=${ttsProviderId ?? 'unknown'}, voice=${ttsVoice ?? 'unknown'}, audioId=${audioId ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      'GENERATION_FAILED',
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
