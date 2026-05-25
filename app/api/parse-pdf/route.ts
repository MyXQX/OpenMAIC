/**
 * app/api/parse-pdf/route.ts
 * 
 * 文件作用：
 * PDF文档解析API端点。接收上传的PDF文件，通过配置的PDF解析提供者（PDFPlumber、pymupdf等）
 * 提取文本内容和图像。这是课堂生成过程中处理用户上传PDF的关键接口。
 * 
 * 运行机理：
 * 1. 请求格式：
 *    - 必须是 multipart/form-data 格式
 *    - 包含 pdf 字段的二进制文件
 *    - 可选的 x-pdf-provider 请求头指定PDF提供者ID
 * 2. 提供者配置：
 *    - 从请求头 x-pdf-provider 获取提供者ID
 *    - 从请求头 x-api-key 获取自定义API密钥
 *    - 从请求头 x-base-url 获取自定义API端点基础URL
 *    - 调用 resolvePDFApiKey() 和 resolvePDFBaseUrl() 解析最终配置
 * 3. SSRF防护：
 *    - 如果使用了自定义 baseUrl，检查其有效性和安全性
 *    - 调用 validateUrlForSSRF() 防止内网访问
 * 4. PDF解析：
 *    - 调用 parsePDF() 进行实际解析
 *    - 返回提取的文本内容、图像URL和元数据
 * 5. 错误处理：
 *    - Content-Type 验证
 *    - 文件上传验证
 *    - PDF格式验证
 *    - 提供者故障处理
 * 
 * 与其他代码的关联：
 * - parsePDF (lib/pdf/pdf-providers)：调用PDF提供者解析
 * - resolvePDFApiKey (lib/server/provider-config)：解析PDF API密钥
 * - resolvePDFBaseUrl (lib/server/provider-config)：解析PDF端点基础URL
 * - validateUrlForSSRF (lib/server/ssrf-guard)：SSRF防护
 * - apiSuccess, apiError (lib/server/api-response)：标准化API响应
 * - ParsedPdfContent (lib/types/pdf)：PDF解析结果类型
 * - 前端通过此接口上传PDF进行课堂生成
 */

import { NextRequest } from 'next/server';
import { parsePDF } from '@/lib/pdf/pdf-providers';
import { resolvePDFApiKey, resolvePDFBaseUrl } from '@/lib/server/provider-config';
import type { PDFProviderId } from '@/lib/pdf/types';
import type { ParsedPdfContent } from '@/lib/types/pdf';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
const log = createLogger('Parse PDF');

export async function POST(req: NextRequest) {
  let pdfFileName: string | undefined;
  let resolvedProviderId: string | undefined;
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      log.error('Invalid Content-Type for PDF upload:', contentType);
      return apiError(
        'INVALID_REQUEST',
        400,
        `Invalid Content-Type: expected multipart/form-data, got "${contentType}"`,
      );
    }

    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File | null;
    const providerId = formData.get('providerId') as PDFProviderId | null;
    const apiKey = formData.get('apiKey') as string | null;
    const baseUrl = formData.get('baseUrl') as string | null;

    if (!pdfFile) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'No PDF file provided');
    }

    // providerId is required from the client — no server-side store to fall back to
    const effectiveProviderId = providerId || ('unpdf' as PDFProviderId);
    pdfFileName = pdfFile?.name;
    resolvedProviderId = effectiveProviderId;

    const clientBaseUrl = baseUrl || undefined;
    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = await validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const config = {
      providerId: effectiveProviderId,
      apiKey: clientBaseUrl
        ? apiKey || ''
        : resolvePDFApiKey(effectiveProviderId, apiKey || undefined),
      baseUrl: clientBaseUrl
        ? clientBaseUrl
        : resolvePDFBaseUrl(effectiveProviderId, baseUrl || undefined),
    };

    // Convert PDF to buffer
    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse PDF using the provider system
    const result = await parsePDF(config, buffer);

    // Add file metadata
    const resultWithMetadata: ParsedPdfContent = {
      ...result,
      metadata: {
        ...result.metadata,
        pageCount: result.metadata?.pageCount ?? 0, // Ensure pageCount is always a number
        fileName: pdfFile.name,
        fileSize: pdfFile.size,
      },
    };

    return apiSuccess({ data: resultWithMetadata });
  } catch (error) {
    log.error(
      `PDF parsing failed [provider=${resolvedProviderId ?? 'unknown'}, file="${pdfFileName ?? 'unknown'}"]:`,
      error,
    );
    return apiError('PARSE_FAILED', 500, error instanceof Error ? error.message : 'Unknown error');
  }
}
