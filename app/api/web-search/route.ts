/**
 * app/api/web-search/route.ts
 * 
 * 文件作用：
 * 网络搜索API端点。根据搜索查询调用配置的网络搜索提供者（Tavily、Brave、Bing、百度等）
 * 获取网络搜索结果，并将结果格式化为LLM可以理解的上下文。用于课堂生成时进行实时信息检索。
 * 
 * 运行机理：
 * 1. 请求参数：
 *    - query：搜索查询字符串
 *    - pdfText：（可选）PDF内容，用于在搜索查询前进行改写
 *    - providerId：网络搜索提供者ID（Tavily、Brave、Bing、Baidu等）
 *    - apiKey：提供者API密钥（可选）
 *    - baseUrl：自定义API端点（可选）
 *    - baiduSubSources：百度搜索特定的子来源配置
 * 2. 搜索查询改写：
 *    - 如果提供了pdfText，可以使用LLM改写查询以包含PDF内容的上下文
 *    - buildSearchQuery() 函数处理查询改写
 *    - 默认使用LLM进行改写（可配置为跳过）
 * 3. 提供者配置：
 *    - 默认提供者：Tavily
 *    - resolveWebSearchApiKey() 从环境变量获取API密钥
 *    - 某些提供者需要API密钥（Tavily、Brave等），某些可能免费
 * 4. 搜索执行：
 *    - 调用 searchWeb() 执行实际搜索
 *    - 返回搜索结果列表
 * 5. 结果格式化：
 *    - formatSearchResultsAsContext() 将搜索结果转换为LLM可用的上下文
 *    - 可以直接注入到生成管道中
 * 
 * 与其他代码的关联：
 * - searchWeb (lib/web-search)：执行网络搜索的核心逻辑
 * - formatSearchResultsAsContext (lib/web-search)：格式化搜索结果
 * - buildSearchQuery (lib/server/search-query-builder)：改写搜索查询
 * - resolveWebSearchApiKey (lib/server/provider-config)：获取搜索提供者配置
 * - 课堂生成管道：在启用网络搜索时调用此API
 * - WEB_SEARCH_PROVIDERS (lib/web-search/constants)：定义支持的搜索提供者
 * - 环境变量：TAVILY_API_KEY、BRAVE_SEARCH_API_KEY等
 */

/**
 * Web Search API
 *
 * POST /api/web-search
 * Simple JSON request/response using the configured web search provider.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { formatSearchResultsAsContext, searchWeb } from '@/lib/web-search';
import { resolveWebSearchApiKey } from '@/lib/server/provider-config';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  buildSearchQuery,
  SEARCH_QUERY_REWRITE_EXCERPT_LENGTH,
} from '@/lib/server/search-query-builder';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import { WEB_SEARCH_PROVIDERS } from '@/lib/web-search/constants';
import type { BaiduSubSources, WebSearchProviderId } from '@/lib/web-search/types';
import { resolveWebSearchRouteBaseUrl } from '@/lib/server/web-search-config';

const log = createLogger('WebSearch');

export async function POST(req: NextRequest) {
  let query: string | undefined;
  try {
    const body = await req.json();
    const {
      query: requestQuery,
      pdfText,
      providerId: requestProviderId,
      apiKey: clientApiKey,
      baseUrl: clientBaseUrl,
      baiduSubSources,
    } = body as {
      query?: string;
      pdfText?: string;
      providerId?: WebSearchProviderId;
      apiKey?: string;
      baseUrl?: string;
      baiduSubSources?: BaiduSubSources;
    };
    query = requestQuery;

    if (!query || !query.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'query is required');
    }

    const providerId: WebSearchProviderId =
      requestProviderId && WEB_SEARCH_PROVIDERS[requestProviderId] ? requestProviderId : 'tavily';
    const provider = WEB_SEARCH_PROVIDERS[providerId];
    const apiKey = resolveWebSearchApiKey(providerId, clientApiKey);
    if (provider.requiresApiKey && !apiKey) {
      return apiError(
        'MISSING_API_KEY',
        400,
        `${provider.name} API key is not configured. Set it in Settings -> Web Search or configure ${getWebSearchEnvKey(providerId)} on the server.`,
      );
    }
    let baseUrl: string | undefined;
    try {
      baseUrl = resolveWebSearchRouteBaseUrl(providerId, clientBaseUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid web search base URL';
      return apiError('INVALID_REQUEST', 400, message);
    }

    // Clamp rewrite input at the route boundary; framework body limits still apply to total request size.
    const boundedPdfText = pdfText?.slice(0, SEARCH_QUERY_REWRITE_EXCERPT_LENGTH);

    let aiCall: AICallFn | undefined;
    try {
      const { model: languageModel, thinkingConfig } = await resolveModelFromRequest(req, body);
      aiCall = async (systemPrompt, userPrompt) => {
        const result = await callLLM(
          {
            model: languageModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            maxOutputTokens: 256,
          },
          'web-search-query-rewrite',
          undefined,
          thinkingConfig,
        );
        return result.text;
      };
    } catch (error) {
      log.warn('Search query rewrite model unavailable, falling back to raw requirement:', error);
    }

    const searchQuery = await buildSearchQuery(query, boundedPdfText, aiCall);

    log.info('Running web search API request', {
      hasPdfContext: searchQuery.hasPdfContext,
      rawRequirementLength: searchQuery.rawRequirementLength,
      rewriteAttempted: searchQuery.rewriteAttempted,
      finalQueryLength: searchQuery.finalQueryLength,
    });

    const result = await searchWeb({
      providerId,
      query: searchQuery.query,
      apiKey,
      baseUrl,
      ...(providerId === 'baidu' && baiduSubSources ? { baiduSubSources } : {}),
    });
    const context = formatSearchResultsAsContext(result);

    return apiSuccess({
      answer: result.answer,
      sources: result.sources,
      context,
      query: result.query,
      responseTime: result.responseTime,
    });
  } catch (err) {
    log.error(`Web search failed [query="${query?.substring(0, 60) ?? 'unknown'}"]:`, err);
    const message = err instanceof Error ? err.message : 'Web search failed';
    return apiError('INTERNAL_ERROR', 500, message);
  }
}

function getWebSearchEnvKey(providerId: WebSearchProviderId): string {
  switch (providerId) {
    case 'baidu':
      return 'BAIDU_API_KEY';
    case 'bocha':
      return 'BOCHA_API_KEY';
    case 'brave':
      return 'BRAVE_API_KEY';
    case 'tavily':
    default:
      return 'TAVILY_API_KEY';
  }
}
