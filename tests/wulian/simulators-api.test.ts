/**
 * 模拟器 API 路由测试
 */

import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/wulian/simulators/route';

describe('GET /api/wulian/simulators', () => {
  it('应返回所有模拟器列表', async () => {
    const req = new Request('http://localhost:3000/api/wulian/simulators');
    const response = await GET(req);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.simulators).toBeDefined();
    expect(Array.isArray(data.simulators)).toBe(true);
    expect(data.simulators).toHaveLength(4);
    
    // 验证返回的模拟器包含所有必需字段
    for (const sim of data.simulators) {
      expect(sim.id).toBeTruthy();
      expect(sim.title).toBeTruthy();
      expect(sim.subject).toBeTruthy();
      expect(Array.isArray(sim.params)).toBe(true);
    }
  });

  it('通过 id 查询应返回指定模拟器', async () => {
    const req = new Request('http://localhost:3000/api/wulian/simulators?id=flux-loop-slider');
    const response = await GET(req);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.id).toBe('flux-loop-slider');
    expect(data.title).toBeTruthy();
    expect(data.subject).toBe('电磁学');
    expect(Array.isArray(data.params)).toBe(true);
  });

  it('查询不存在的 id 应返回 404', async () => {
    const req = new Request('http://localhost:3000/api/wulian/simulators?id=non-existent');
    const response = await GET(req);
    
    expect(response.status).toBe(404);
    
    const data = await response.json();
    expect(data.error).toBe('Simulator not found');
    expect(data.simulatorId).toBe('non-existent');
  });

  it('所有已知模拟器 id 都应可查询', async () => {
    const ids = ['flux-loop-slider', 'photoelectric', 'double-slit', 'newton-block'];
    
    for (const id of ids) {
      const req = new Request(`http://localhost:3000/api/wulian/simulators?id=${id}`);
      const response = await GET(req);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.id).toBe(id);
    }
  });
});
