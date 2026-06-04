/**
 * Tests for formatRetrievalForGeneration function
 * Task 5.2 - 实现检索结果 → 生成参考上下文格式化
 */

import { describe, it, expect } from 'vitest';
import { formatRetrievalForGeneration } from '@/lib/wulian/rag/store';
import type { RetrievedChunk } from '@/lib/wulian/types';

describe('formatRetrievalForGeneration', () => {
  it('should return empty message when no chunks are provided (需求 2.6)', () => {
    const result = formatRetrievalForGeneration([], 'course');
    expect(result).toContain('未检索到相关资料');
    expect(result).toContain('以下内容将基于一般教材');
  });

  it('should format single course mode chunks with numbered citations (需求 2.1, 2.5)', () => {
    const chunks: RetrievedChunk[] = [
      {
        id: 'chunk1',
        text: '法拉第电磁感应定律指出，闭合回路中感应电动势的大小与穿过回路的磁通量变化率成正比。',
        score: 0.95,
        source: 'builtin',
        sourceLabel: '电磁学基础教材',
      },
      {
        id: 'chunk2',
        text: '楞次定律表明，感应电流产生的磁场总是阻碍原磁通量的变化。',
        score: 0.88,
        source: 'builtin',
        sourceLabel: '电磁学基础教材',
      },
    ];

    const result = formatRetrievalForGeneration(chunks, 'course');
    
    expect(result).toContain('## 参考资料（课程内置教材）');
    expect(result).toContain('[#1]');
    expect(result).toContain('[#2]');
    expect(result).toContain('法拉第电磁感应定律');
    expect(result).toContain('楞次定律');
    expect(result).toContain('电磁学基础教材');
  });

  it('should format mine mode with user uploaded sources (需求 2.1, 2.5)', () => {
    const chunks: RetrievedChunk[] = [
      {
        id: 'chunk1',
        text: '用户笔记：电磁感应是通过变化的磁场产生电场的现象。',
        score: 0.92,
        source: 'uploaded',
        sourceLabel: '我的物理笔记.pdf',
      },
    ];

    const result = formatRetrievalForGeneration(chunks, 'mine');
    
    expect(result).toContain('## 参考资料（用户上传资料）');
    expect(result).toContain('[#1]');
    expect(result).toContain('我的物理笔记.pdf');
    expect(result).toContain('用户笔记');
  });

  it('should format compare mode with grouped sources and comparison instructions (需求 2.2)', () => {
    const chunks: RetrievedChunk[] = [
      {
        id: 'builtin1',
        text: '标准教材定义：感应电动势 ε = -dΦ/dt',
        score: 0.95,
        source: 'builtin',
        sourceLabel: '标准物理教材',
      },
      {
        id: 'builtin2',
        text: '感应电流方向由楞次定律确定。',
        score: 0.90,
        source: 'builtin',
        sourceLabel: '标准物理教材',
      },
      {
        id: 'uploaded1',
        text: '用户资料：感应电动势也可写作 ε = BLv 的形式。',
        score: 0.88,
        source: 'uploaded',
        sourceLabel: '高级电磁学.pdf',
      },
    ];

    const result = formatRetrievalForGeneration(chunks, 'compare');
    
    // 需求 2.2: 检查对照模式特有的结构
    expect(result).toContain('## 参考资料（对照模式）');
    expect(result).toContain('标注两者的一致点');
    expect(result).toContain('明确指出差异之处');
    expect(result).toContain('以课程内置教材为准');
    
    // 检查分组
    expect(result).toContain('### 课程内置教材');
    expect(result).toContain('### 用户上传资料');
    
    // 需求 2.5: 检查编号连续性
    expect(result).toContain('[#1]'); // 内置第一个
    expect(result).toContain('[#2]'); // 内置第二个
    expect(result).toContain('[#3]'); // 上传第一个（编号继续）
    
    // 检查内容分组正确
    const builtinIndex = result.indexOf('### 课程内置教材');
    const uploadedIndex = result.indexOf('### 用户上传资料');
    const builtin1Index = result.indexOf('标准教材定义');
    const uploaded1Index = result.indexOf('用户资料：感应电动势');
    
    expect(builtinIndex).toBeLessThan(uploadedIndex);
    expect(builtin1Index).toBeGreaterThan(builtinIndex);
    expect(builtin1Index).toBeLessThan(uploadedIndex);
    expect(uploaded1Index).toBeGreaterThan(uploadedIndex);
  });

  it('should handle compare mode with only builtin chunks', () => {
    const chunks: RetrievedChunk[] = [
      {
        id: 'builtin1',
        text: '内置内容1',
        score: 0.95,
        source: 'builtin',
        sourceLabel: '教材A',
      },
    ];

    const result = formatRetrievalForGeneration(chunks, 'compare');
    
    expect(result).toContain('### 课程内置教材');
    expect(result).not.toContain('### 用户上传资料');
    expect(result).toContain('[#1]');
  });

  it('should handle compare mode with only uploaded chunks', () => {
    const chunks: RetrievedChunk[] = [
      {
        id: 'uploaded1',
        text: '上传内容1',
        score: 0.92,
        source: 'uploaded',
        sourceLabel: '用户文档',
      },
    ];

    const result = formatRetrievalForGeneration(chunks, 'compare');
    
    expect(result).toContain('### 用户上传资料');
    expect(result).not.toContain('### 课程内置教材');
    expect(result).toContain('[#1]');
  });

  it('should maintain proper citation numbering sequence in all modes', () => {
    const chunks: RetrievedChunk[] = [
      { id: '1', text: 'Text 1', score: 1, source: 'builtin', sourceLabel: 'Source 1' },
      { id: '2', text: 'Text 2', score: 0.9, source: 'builtin', sourceLabel: 'Source 2' },
      { id: '3', text: 'Text 3', score: 0.8, source: 'builtin', sourceLabel: 'Source 3' },
    ];

    const resultCourse = formatRetrievalForGeneration(chunks, 'course');
    expect(resultCourse).toMatch(/\[#1\][\s\S]*\[#2\][\s\S]*\[#3\]/);

    const resultMine = formatRetrievalForGeneration(
      chunks.map((c) => ({ ...c, source: 'uploaded' as const })),
      'mine',
    );
    expect(resultMine).toMatch(/\[#1\][\s\S]*\[#2\][\s\S]*\[#3\]/);
  });

  it('should preserve original text content without modifications', () => {
    const originalText = '这是一段包含特殊字符的文本：\n- 换行\n- 公式 E=mc²\n- 符号 α, β, γ';
    const chunks: RetrievedChunk[] = [
      {
        id: 'chunk1',
        text: originalText,
        score: 1.0,
        source: 'builtin',
        sourceLabel: '测试文档',
      },
    ];

    const result = formatRetrievalForGeneration(chunks, 'course');
    expect(result).toContain(originalText.trim());
  });
});
