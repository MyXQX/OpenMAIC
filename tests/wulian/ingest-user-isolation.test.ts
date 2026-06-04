/**
 * 测试任务 5.1：上传/检索按用户隔离
 *
 * 验收标准（需求 2.4 / 6.3 / 8.1 / 12.1）：
 *   - 登录用户上传资料写入 users/<userId>/uploads|vectors
 *   - 访客（未登录）上传被拒绝，提示前端处理本地存储
 *   - 复用现有 chunk/embed/parse，保留关键词降级
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import {
  userUploadsDir,
  userVectorsDir,
  ensureUserDirs,
  USERS_DIR,
} from '@/lib/wulian/storage';
import {
  saveUserUploadCorpus,
  loadUserUploadCorpus,
  loadUserUploadChunks,
} from '@/lib/wulian/rag/store';

describe('Task 5.1: 上传/检索按用户隔离', () => {
  const testUserId = `test-user-${nanoid(6)}`;
  const testDocId = `test-doc-${nanoid(8)}`;

  beforeEach(async () => {
    await ensureUserDirs(testUserId);
  });

  afterEach(async () => {
    // 清理测试数据
    try {
      const userDir = path.join(USERS_DIR, testUserId);
      await fs.rm(userDir, { recursive: true, force: true });
    } catch (err) {
      // 忽略清理错误
    }
  });

  it('应该将上传资料保存到用户隔离的目录', async () => {
    const corpus = {
      docId: testDocId,
      filename: 'test.txt',
      chunks: [
        {
          id: `${testDocId}_0`,
          docId: testDocId,
          index: 0,
          text: '这是测试内容',
          metadata: {},
          embedding: null,
        },
      ],
    };

    // 保存到用户隔离目录
    await saveUserUploadCorpus(testUserId, corpus);

    // 验证文件存在于正确的路径
    const vectorPath = path.join(userVectorsDir(testUserId), `${testDocId}.json`);
    const exists = await fs
      .access(vectorPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    // 验证可以读取回来
    const loaded = await loadUserUploadCorpus(testUserId, testDocId);
    expect(loaded).not.toBeNull();
    expect(loaded?.filename).toBe('test.txt');
    expect(loaded?.chunks).toHaveLength(1);
    expect(loaded?.chunks[0].text).toBe('这是测试内容');
  });

  it('应该隔离不同用户的上传资料', async () => {
    const userId1 = `user1-${nanoid(6)}`;
    const userId2 = `user2-${nanoid(6)}`;
    const docId = `shared-doc-${nanoid(8)}`;

    await ensureUserDirs(userId1);
    await ensureUserDirs(userId2);

    try {
      // 用户1上传
      await saveUserUploadCorpus(userId1, {
        docId,
        filename: 'user1-file.txt',
        chunks: [
          {
            id: `${docId}_0`,
            docId,
            index: 0,
            text: '用户1的内容',
            metadata: {},
            embedding: null,
          },
        ],
      });

      // 用户2上传同名docId
      await saveUserUploadCorpus(userId2, {
        docId,
        filename: 'user2-file.txt',
        chunks: [
          {
            id: `${docId}_0`,
            docId,
            index: 0,
            text: '用户2的内容',
            metadata: {},
            embedding: null,
          },
        ],
      });

      // 验证用户1只能看到自己的内容
      const user1Data = await loadUserUploadCorpus(userId1, docId);
      expect(user1Data?.filename).toBe('user1-file.txt');
      expect(user1Data?.chunks[0].text).toBe('用户1的内容');

      // 验证用户2只能看到自己的内容
      const user2Data = await loadUserUploadCorpus(userId2, docId);
      expect(user2Data?.filename).toBe('user2-file.txt');
      expect(user2Data?.chunks[0].text).toBe('用户2的内容');
    } finally {
      // 清理
      await fs.rm(path.join(USERS_DIR, userId1), { recursive: true, force: true }).catch(() => {});
      await fs.rm(path.join(USERS_DIR, userId2), { recursive: true, force: true }).catch(() => {});
    }
  });

  it('应该使用内存缓存避免重复读取', async () => {
    const corpus = {
      docId: testDocId,
      filename: 'cached.txt',
      chunks: [
        {
          id: `${testDocId}_0`,
          docId: testDocId,
          index: 0,
          text: '缓存测试',
          metadata: {},
          embedding: null,
        },
      ],
    };

    await saveUserUploadCorpus(testUserId, corpus);

    // 第一次读取（从文件）
    const chunks1 = await loadUserUploadChunks(testUserId, testDocId);
    expect(chunks1).toHaveLength(1);

    // 删除文件
    const vectorPath = path.join(userVectorsDir(testUserId), `${testDocId}.json`);
    await fs.unlink(vectorPath);

    // 第二次读取应该从缓存返回
    const chunks2 = await loadUserUploadChunks(testUserId, testDocId);
    expect(chunks2).toHaveLength(1);
    expect(chunks2[0].text).toBe('缓存测试');
  });

  it('应该校验userId合法性，防止路径穿越', async () => {
    const maliciousUserId = '../../../etc/passwd';

    await expect(async () => {
      await saveUserUploadCorpus(maliciousUserId, {
        docId: 'test',
        filename: 'test.txt',
        chunks: [],
      });
    }).rejects.toThrow();
  });
});
