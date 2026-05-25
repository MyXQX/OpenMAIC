/**
 * lib/logger.ts
 * 
 * 文件作用：
 * 提供统一的日志记录系统，支持多个日志级别（debug、info、warn、error）、
 * 不同格式输出（纯文本或JSON）、可配置的最小日志级别等功能。
 * 
 * 运行机理：
 * 1. 日志级别：
 *    - debug(0) < info(1) < warn(2) < error(3)
 *    - 通过 LOG_LEVEL 环境变量控制最小日志级别，低于该级别的日志不输出
 * 2. 输出格式：
 *    - 普通格式：[ISO时间] [日志级别] [标签] 消息内容
 *    - JSON格式：{timestamp, level, tag, message} 的JSON对象
 *    - 通过 LOG_FORMAT=json 环境变量启用JSON格式
 * 3. 记录器工厂函数：
 *    - createLogger(tag) 创建一个带有特定标签的记录器实例
 *    - 每个记录器的日志都会标记该标签，便于追踪来源
 * 4. 输出处理：
 *    - debug → console.debug
 *    - info → console.log
 *    - warn → console.warn
 *    - error → console.error
 *    - Error对象自动展开为堆栈跟踪
 *    - 非字符串对象自动JSON序列化
 * 
 * 与其他代码的关联：
 * - 在整个项目中广泛使用：应用路由、API端点、组件等都使用 createLogger()
 * - 可通过环境变量配置：LOG_LEVEL (debug|info|warn|error)、LOG_FORMAT (json)
 * - 用于调试、监控和错误跟踪
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

function getMinLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return env in LOG_LEVELS ? (env as LogLevel) : 'info';
}

function isJsonFormat(): boolean {
  return process.env.LOG_FORMAT === 'json';
}

function formatLine(level: LogLevel, tag: string, args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const upperLevel = level.toUpperCase();
  const msg = args
    .map((a) =>
      a instanceof Error ? (a.stack ?? a.message) : typeof a === 'string' ? a : JSON.stringify(a),
    )
    .join(' ');

  if (isJsonFormat()) {
    return JSON.stringify({ timestamp, level: upperLevel, tag, message: msg });
  }
  return `[${timestamp}] [${upperLevel}] [${tag}] ${msg}`;
}

export function createLogger(tag: string) {
  const emit = (level: LogLevel, args: unknown[]) => {
    if (LOG_LEVELS[level] < LOG_LEVELS[getMinLevel()]) return;

    const line = formatLine(level, tag, args);

    // Console output
    const fn =
      level === 'debug'
        ? console.debug
        : level === 'warn'
          ? console.warn
          : level === 'error'
            ? console.error
            : console.log;
    fn(line);
  };

  return {
    debug: (...args: unknown[]) => emit('debug', args),
    info: (...args: unknown[]) => emit('info', args),
    warn: (...args: unknown[]) => emit('warn', args),
    error: (...args: unknown[]) => emit('error', args),
  };
}
