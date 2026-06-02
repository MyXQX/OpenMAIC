/**
 * GET /api/wulian/simulators - 获取模拟器注册表
 *
 * 返回所有注册的物理模拟器定义（id、title、subject、参数等）
 * 供前端初始化定制向导与课堂播放器使用
 */

import { NextResponse } from 'next/server';
import { listSimulators, getSimulator } from '@/lib/wulian/simulators/registry';

export const runtime = 'nodejs';

/**
 * GET /api/wulian/simulators - 列出所有模拟器
 * GET /api/wulian/simulators?id=<simulatorId> - 获取指定模拟器
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      // 查询单个模拟器
      const simulator = getSimulator(id);
      if (!simulator) {
        return NextResponse.json(
          { error: 'Simulator not found', simulatorId: id },
          { status: 404 }
        );
      }
      return NextResponse.json(simulator);
    }

    // 返回所有模拟器
    const simulators = listSimulators();
    return NextResponse.json({ simulators });
  } catch (error) {
    console.error('[/api/wulian/simulators] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
