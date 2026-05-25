/**
 * app/api/generate/image/route.ts
 * 
 * 文件作用：
 * 图像生成API端点。根据文本提示词调用配置的图像生成提供者（DALL-E、Flux、Seedream等）
 * 生成图像。在课堂场景生成后由客户端并行调用，为幻灯片生成配套的插图和图表。
 * 
 * 运行机理：
 * 1. 请求头参数：
 *    - x-image-provider：图像生成提供者ID（默认：'seedream'）
 *    - x-api-key：提供者API密钥（可选）
 *    - x-base-url：自定义API端点基础URL（可选）
 *    - x-image-model：特定的模型ID（可选）
 * 2. 请求体参数（ImageGenerationOptions）：
 *    - prompt：图像提示词（必需）
 *    - negativePrompt：负面提示词（可选）
 *    - width/height：指定尺寸（可选）
 *    - aspectRatio：纵横比（可选，例如'16:9'、'1:1'）
 *    - style：生成风格（可选）
 * 3. 提供者配置：
 *    - resolveImageApiKey() 从环境变量或客户端参数获取API密钥
 *    - 某些提供者需要API密钥，某些可能免费
 * 4. 尺寸处理：
 *    - 如果指定了纵横比但未指定宽高，调用 aspectRatioToDimensions() 转换
 * 5. SSRF防护：
 *    - 如果提供了自定义baseUrl，在生产环境进行SSRF检查
 * 6. 图像生成：
 *    - 调用 generateImage() 执行实际的图像生成
 *    - 返回生成的图像（URL或base64编码）
 * 
 * 与其他代码的关联：
 * - generateImage (lib/media/image-providers)：执行图像生成的核心逻辑
 * - IMAGE_PROVIDERS (lib/media/image-providers)：定义支持的图像生成提供者
 * - resolveImageApiKey (lib/server/provider-config)：获取图像提供者配置
 * - 课堂生成管道：在生成场景后调用此API获取插图
 * - 环境变量：OPENAI_API_KEY（DALL-E）、FLUX_API_KEY等
 */

/**
 * Image Generation API
 *
 * Generates an image from a text prompt using the specified provider.
 * Called by the client during media generation after slides are produced.
 *
 * POST /api/generate/image
 *
 * Headers:
 *   x-image-provider: ImageProviderId (default: 'seedream')
 *   x-api-key: string (optional, server fallback)
 *   x-base-url: string (optional, server fallback)
 *
 * Body: { prompt, negativePrompt?, width?, height?, aspectRatio?, style? }
 * Response: { success: boolean, result?: ImageGenerationResult, error?: string }
 */

import { NextRequest } from 'next/server';
import {
  generateImage,
  aspectRatioToDimensions,
  IMAGE_PROVIDERS,
} from '@/lib/media/image-providers';
import { resolveImageApiKey, resolveImageBaseUrl } from '@/lib/server/provider-config';
import type { ImageProviderId, ImageGenerationOptions } from '@/lib/media/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

const log = createLogger('ImageGeneration API');

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ImageGenerationOptions;

    if (!body.prompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing prompt');
    }

    const providerId = (request.headers.get('x-image-provider') || 'seedream') as ImageProviderId;
    const clientApiKey = request.headers.get('x-api-key') || undefined;
    const clientBaseUrl = request.headers.get('x-base-url') || undefined;
    const clientModel = request.headers.get('x-image-model') || undefined;

    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = await validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const apiKey = clientBaseUrl
      ? clientApiKey || ''
      : resolveImageApiKey(providerId, clientApiKey);
    const provider = IMAGE_PROVIDERS[providerId];
    if (provider?.requiresApiKey && !apiKey) {
      return apiError(
        'MISSING_API_KEY',
        401,
        `No API key configured for image provider: ${providerId}`,
      );
    }

    const baseUrl = clientBaseUrl ? clientBaseUrl : resolveImageBaseUrl(providerId, clientBaseUrl);

    // Resolve dimensions from aspect ratio if not explicitly set
    if (!body.width && !body.height && body.aspectRatio) {
      const dims = aspectRatioToDimensions(body.aspectRatio);
      body.width = dims.width;
      body.height = dims.height;
    }

    log.info(
      `Generating image: provider=${providerId}, model=${clientModel || 'default'}, ` +
        `prompt="${body.prompt.slice(0, 80)}...", size=${body.width ?? 'auto'}x${body.height ?? 'auto'}`,
    );

    const result = await generateImage({ providerId, apiKey, baseUrl, model: clientModel }, body);

    return apiSuccess({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Detect content safety filter rejections (e.g. Seedream OutputImageSensitiveContentDetected)
    if (message.includes('SensitiveContent') || message.includes('sensitive information')) {
      log.warn(`Image blocked by content safety filter: ${message}`);
      return apiError('CONTENT_SENSITIVE', 400, message);
    }
    log.error(
      `Image generation failed [provider=${request.headers.get('x-image-provider') ?? 'seedream'}, model=${request.headers.get('x-image-model') ?? 'default'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, message);
  }
}
