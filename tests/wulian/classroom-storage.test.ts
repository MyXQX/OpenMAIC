import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  saveClassroomInstance,
  getClassroomInstance,
  listClassroomInstances,
  toPersistedClassroomData,
  userDir,
  USERS_DIR,
  OwnershipError,
  InvalidIdError,
} from '@/lib/wulian/storage';
import type { WulianClassroomInstance } from '@/lib/wulian/types';
import type { Stage, Scene } from '@/lib/types/stage';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Track created test users so we can clean their directories after each test. */
const createdUsers = new Set<string>();

function trackUser(userId: string): string {
  createdUsers.add(userId);
  return userId;
}

/** Unique, path-safe test user id (only [A-Za-z0-9_-]). */
function makeUserId(suffix = ''): string {
  const id = `test_user_${Date.now()}_${Math.random().toString(36).slice(2)}${suffix}`;
  return trackUser(id);
}

function makeStage(id: string): Stage {
  return { id, name: 'stage', createdAt: 1, updatedAt: 2 } as Stage;
}

function makeScene(id: string, stageId: string): Scene {
  return {
    id,
    stageId,
    type: 'quiz',
    title: 't',
    order: 0,
    content: { type: 'quiz', questions: [] },
  } as unknown as Scene;
}

function makeInstance(
  overrides: Partial<WulianClassroomInstance> & Pick<WulianClassroomInstance, 'id' | 'owner'>,
): WulianClassroomInstance {
  const { id, owner } = overrides;
  return {
    id,
    owner,
    chapterId: 'em-induction',
    stage: makeStage('stage-1'),
    scenes: [makeScene('scene-1', 'stage-1')],
    personalization: {
      chapterId: 'em-induction',
      studentProfile: {
        userId: owner,
        level: 'beginner',
        goals: ['exam'],
        updatedAt: 1,
      },
      materialMode: 'course',
      uploadedDocIds: [],
      selectedSimulatorIds: [],
    },
    simulators: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(async () => {
  // Remove every test user directory created during the test.
  for (const userId of createdUsers) {
    try {
      await fs.rm(userDir(userId), { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  createdUsers.clear();
});

// ----------------------------------------------------------------------------
// Unit tests — concrete behavior and edge cases
// ----------------------------------------------------------------------------

describe('定制课堂实例持久化：save / get（含 owner 校验）', () => {
  it('保存后能由同一 owner 读出等价实例', async () => {
    const owner = makeUserId();
    const instance = makeInstance({ id: 'inst-1', owner });
    await saveClassroomInstance(instance);

    const loaded = await getClassroomInstance(owner, 'inst-1');
    expect(loaded).toEqual(instance);
  });

  it('实例落到按用户隔离的 classrooms 目录下', async () => {
    const owner = makeUserId();
    const instance = makeInstance({ id: 'inst-99', owner });
    await saveClassroomInstance(instance);

    const expectedPath = path.join(userDir(owner), 'classrooms', 'inst-99.json');
    const raw = await fs.readFile(expectedPath, 'utf-8');
    expect(JSON.parse(raw)).toEqual(instance);
  });

  it('不存在的实例返回 null', async () => {
    const owner = makeUserId();
    const loaded = await getClassroomInstance(owner, 'does-not-exist');
    expect(loaded).toBeNull();
  });

  it('跨 owner 读取被拒绝（OwnershipError）', async () => {
    const ownerA = makeUserId('_a');
    const ownerB = makeUserId('_b');
    // ownerA 的实例，但被篡改后试图从 ownerB 读取：通过把文件写到 B 目录但 owner=A 来构造。
    const instance = makeInstance({ id: 'inst-cross', owner: ownerA });
    // 直接把 A 的实例对象写入 B 的目录，模拟数据被篡改/错放。
    const bPath = path.join(userDir(ownerB), 'classrooms', 'inst-cross.json');
    await fs.mkdir(path.dirname(bPath), { recursive: true });
    await fs.writeFile(bPath, JSON.stringify(instance), 'utf-8');

    await expect(getClassroomInstance(ownerB, 'inst-cross')).rejects.toBeInstanceOf(OwnershipError);
  });

  it('非法 userId / classroomId 抛 InvalidIdError（防路径穿越）', async () => {
    await expect(getClassroomInstance('../etc', 'x')).rejects.toBeInstanceOf(InvalidIdError);
    const owner = makeUserId();
    await expect(getClassroomInstance(owner, '../../secret')).rejects.toBeInstanceOf(
      InvalidIdError,
    );
  });
});

describe('定制课堂实例列举：listClassroomInstances(owner, chapterId)', () => {
  it('用户无任何实例时返回空数组', async () => {
    const owner = makeUserId();
    expect(await listClassroomInstances(owner)).toEqual([]);
  });

  it('列出该 owner 全部实例，并可按 chapterId 过滤', async () => {
    const owner = makeUserId();
    await saveClassroomInstance(makeInstance({ id: 'a', owner, chapterId: 'em-induction' }));
    await saveClassroomInstance(makeInstance({ id: 'b', owner, chapterId: 'optics' }));
    await saveClassroomInstance(makeInstance({ id: 'c', owner, chapterId: 'em-induction' }));

    const all = await listClassroomInstances(owner);
    expect(all.map((i) => i.id).sort()).toEqual(['a', 'b', 'c']);

    const em = await listClassroomInstances(owner, 'em-induction');
    expect(em.map((i) => i.id).sort()).toEqual(['a', 'c']);
    expect(em.every((i) => i.chapterId === 'em-induction')).toBe(true);
  });

  it('结果按 updatedAt 倒序（最近更新在前）', async () => {
    const owner = makeUserId();
    await saveClassroomInstance(
      makeInstance({ id: 'old', owner, updatedAt: '2024-01-01T00:00:00.000Z' }),
    );
    await saveClassroomInstance(
      makeInstance({ id: 'new', owner, updatedAt: '2024-06-01T00:00:00.000Z' }),
    );
    await saveClassroomInstance(
      makeInstance({ id: 'mid', owner, updatedAt: '2024-03-01T00:00:00.000Z' }),
    );

    const all = await listClassroomInstances(owner);
    expect(all.map((i) => i.id)).toEqual(['new', 'mid', 'old']);
  });

  it('仅返回归属于该 owner 的实例（跳过错放/篡改的他人实例）', async () => {
    const owner = makeUserId();
    await saveClassroomInstance(makeInstance({ id: 'mine', owner }));
    // 在 owner 的目录中放一个 owner 字段不符的文件，应被跳过。
    const foreign = makeInstance({ id: 'foreign', owner: 'someone-else' });
    const foreignPath = path.join(userDir(owner), 'classrooms', 'foreign.json');
    await fs.writeFile(foreignPath, JSON.stringify(foreign), 'utf-8');

    const all = await listClassroomInstances(owner);
    expect(all.map((i) => i.id)).toEqual(['mine']);
  });
});

describe('PersistedClassroomData 兼容性', () => {
  it('toPersistedClassroomData 投影出纯 MAIC 结构（id/stage/scenes/createdAt）', () => {
    const owner = trackUser('user_proj');
    const instance = makeInstance({ id: 'inst-proj', owner });
    const persisted = toPersistedClassroomData(instance);
    expect(persisted).toEqual({
      id: instance.id,
      stage: instance.stage,
      scenes: instance.scenes,
      createdAt: instance.createdAt,
    });
    // 不应携带 wulian 元数据。
    expect(persisted as Record<string, unknown>).not.toHaveProperty('owner');
    expect(persisted as Record<string, unknown>).not.toHaveProperty('personalization');
  });
});

// ----------------------------------------------------------------------------
// Property test — save/get round-trip + per-owner isolation
// ----------------------------------------------------------------------------

/** Path-safe id arbitrary matching the storage validator regex. */
const safeIdArb = fc
  .stringMatching(/^[A-Za-z0-9_-]+$/)
  .filter((s) => s.length > 0 && s.length <= 64);

describe('定制课堂实例属性测试', () => {
  // **Validates: Requirements 8.1, 8.3**
  it('任意合法 owner/id：保存后只能由该 owner 原样读出', async () => {
    await fc.assert(
      fc.asyncProperty(safeIdArb, safeIdArb, fc.string(), async (rawOwner, rawId, chapterId) => {
        const owner = trackUser(`pbt_${rawOwner}`);
        const id = `pbt_${rawId}`;
        const instance = makeInstance({ id, owner, chapterId });

        await saveClassroomInstance(instance);
        const loaded = await getClassroomInstance(owner, id);
        expect(loaded).toEqual(instance);

        // 列举时该实例可见且归属正确。
        const listed = await listClassroomInstances(owner, chapterId);
        expect(listed.some((i) => i.id === id && i.owner === owner)).toBe(true);
      }),
      { numRuns: 25 },
    );
  });
});
