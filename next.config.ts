/**
 * next.config.ts
 * 
 * 文件作用：
 * Next.js 项目配置文件，定义构建优化、包转译、HTTP头安全策略等。
 * 
 * 运行机理：
 * 1. 构建配置：
 *    - output: 'standalone'（非Vercel环境）：生成独立可部署的应用
 *    - Vercel环境使用默认配置，无需standalone输出
 * 2. 包处理：
 *    - transpilePackages：指定需要编译的包（mathml2omml、pptxgenjs）
 *    - serverExternalPackages：声明只在服务器运行的包
 * 3. 请求体大小：
 *    - experimental.proxyClientMaxBodySize: '200mb'：允许上传最大200MB的文件（如PDF）
 * 4. 安全头部：
 *    - X-Frame-Options: SAMEORIGIN：防止clickjacking，仅允许同源嵌入
 *    - Content-Security-Policy (frame-ancestors)：定义该应用可被哪些源嵌入
 *      - 默认：'self'（仅允许同源）
 *      - 可通过 ALLOWED_FRAME_ANCESTORS 环境变量扩展
 *      - 当配置了ALLOWED_FRAME_ANCESTORS时，不设置X-Frame-Options
 * 
 * 与其他代码的关联：
 * - 环境变量：VERCEL（在Vercel平台自动设置）、ALLOWED_FRAME_ANCESTORS（可选）
 * - 编译目标包：packages/mathml2omml（数学公式转换）、packages/pptxgenjs（PPT生成）
 * - 上传处理：app/page.tsx 支持200MB以内的PDF上传
 */

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  transpilePackages: ['mathml2omml', 'pptxgenjs'],
  serverExternalPackages: [],
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
  async headers() {
    const extraAncestors = process.env.ALLOWED_FRAME_ANCESTORS?.trim();
    const frameAncestors = extraAncestors ? `'self' ${extraAncestors}` : "'self'";

    return [
      {
        source: '/(.*)',
        headers: [
          // X-Frame-Options only supports SAMEORIGIN (no allow-list),
          // so we omit it when custom ancestors are configured.
          ...(!extraAncestors ? [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] : []),
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${frameAncestors}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
