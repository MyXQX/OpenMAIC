import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { StudentProfile } from '@/lib/wulian/types';

// The storage module derives all paths from process.cwd() at module-eval time.
// We point cwd at an isolated temp dir per test so reads/writes never touch the
// real data/ tree, and reset the module registry so the path constants re-bind
// to the current cwd on each fresh dynamic import.
let tmpRoot: string;
let originalCwd: string;

async function loadStorage() {
  return import('@/lib/wulian/storage');
}

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wulian-storage-'));
  process.chdir(tmpRoot);
  vi.resetModules();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('按用户隔离的目录结构（需求 8.1）', () => {
  it('为不同 userId 构造互不重叠的隔离路径', async () => {
    const s = await loadStorage();
    const a = s.userDir('alice');
    const b = s.userDir('bob');
    expect(a).not.toBe(b);
    expect(a).toContain(path.join('data', 'wulian', 'users', 'alice'));
    expect(b).toContain(path.join('data', 'wulian', 'users', 'bob'));
  });

  it('暴露 profile/classrooms/uploads/vectors/feedback 的标准子路径', async () => {
    const s = await loadStorage();
    const root = s.userDir('alice');
    expect(s.userProfilePath('alice')).toBe(path.join(root, 'profile.json'));
    expect(s.userClassroomsDir('alice')).toBe(path.join(root, 'classrooms'));
    expect(s.userClassroomPath('alice', 'c1')).toBe(path.join(root, 'classrooms', 'c1.json'));
    expect(s.userUploadsDir('alice')).toBe(path.join(root, 'uploads'));
    expect(s.userVectorsDir('alice')).toBe(path.join(root, 'vectors'));
    expect(s.userFeedbackDir('alice')).toBe(path.join(root, 'feedback'));
  });

  it('ensureUserDirs 创建全部隔离子目录', async () => {
    const s = await loadStorage();
    await s.ensureUserDirs('alice');
    for (const dir of [
      s.userClassroomsDir('alice'),
      s.userUploadsDir('alice'),
      s.userVectorsDir('alice'),
      s.userFeedbackDir('alice'),
    ]) {
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    }
  });
});

describe('标识符校验（防路径穿越）', () => {
  it('接受常规标识符，拒绝穿越/非法字符', async () => {
    const s = await loadStorage();
    expect(s.isValidUserId('alice')).toBe(true);
    expect(s.isValidUserId('user_123-AB')).toBe(true);
    expect(s.isValidUserId('')).toBe(false);
    expect(s.isValidUserId('..')).toBe(false);
    expect(s.isValidUserId('a/b')).toBe(false);
    expect(s.isValidUserId('a..b')).toBe(false);
    expect(s.isValidUserId('a.b')).toBe(false);
    expect(s.isValidUserId(undefined)).toBe(false);
  });

  it('非法 userId 构造路径时抛 InvalidIdError', async () => {
    const s = await loadStorage();
    expect(() => s.userDir('../escape')).toThrow(s.InvalidIdError);
    expect(() => s.userProfilePath('a/b')).toThrow(s.InvalidIdError);
  });

  it('非法 classroomId 抛 InvalidIdError', async () => {
    const s = await loadStorage();
    expect(() => s.userClassroomPath('alice', '../other')).toThrow(s.InvalidIdError);
  });
});

describe('归属（owner）校验（需求 8.3）', () => {
  it('isOwnedBy 仅在 ownerId 等于 userId 时为真', async () => {
    const s = await loadStorage();
    expect(s.isOwnedBy('alice', 'alice')).toBe(true);
    expect(s.isOwnedBy('alice', 'bob')).toBe(false);
    expect(s.isOwnedBy(null, 'alice')).toBe(false);
    expect(s.isOwnedBy(undefined, 'alice')).toBe(false);
    expect(s.isOwnedBy('', 'alice')).toBe(false);
  });

  it('assertOwnership 对越权访问抛 OwnershipError', async () => {
    const s = await loadStorage();
    expect(() => s.assertOwnership('alice', 'alice')).not.toThrow();
    expect(() => s.assertOwnership('alice', 'bob')).toThrow(s.OwnershipError);
    expect(() => s.assertOwnership(null, 'bob')).toThrow(s.OwnershipError);
  });
});

describe('学生画像原子读写 + 归属校验（需求 8.1/8.2/8.3）', () => {
  const profile = (userId: string): StudentProfile => ({
    userId,
    level: 'beginner',
    goals: ['exam'],
    updatedAt: 123,
  });

  it('写入后可由本人读出，且结构一致', async () => {
    const s = await loadStorage();
    await s.writeProfile(profile('alice'));
    const read = await s.readProfile('alice');
    expect(read).toEqual(profile('alice'));
  });

  it('画像不存在时读出 null', async () => {
    const s = await loadStorage();
    expect(await s.readProfile('ghost')).toBeNull();
  });

  it('原子写不残留临时文件（.tmp）', async () => {
    const s = await loadStorage();
    await s.writeProfile(profile('alice'));
    const files = await fs.readdir(s.userDir('alice'));
    expect(files).toContain('profile.json');
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('画像被篡改为他人归属时读取抛 OwnershipError', async () => {
    const s = await loadStorage();
    // Manually write a profile whose userId disagrees with the directory owner.
    await s.ensureUserDirs('alice');
    await s.writeUserJsonAtomic(s.userProfilePath('alice'), profile('mallory'));
    await expect(s.readProfile('alice')).rejects.toThrow(s.OwnershipError);
  });
});
