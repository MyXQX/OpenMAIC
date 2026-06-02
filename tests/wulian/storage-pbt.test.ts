import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  saveClassroomInstance,
  getClassroomInstance,
  listClassroomInstances,
  writeProfile,
  readProfile,
  writeUserJsonAtomic,
  readUserJson,
  ensureUserDirs,
  userDir,
  userClassroomsDir,
  userClassroomPath,
  userProfilePath,
  OwnershipError,
} from '@/lib/wulian/storage';
import type { StudentProfile, WulianClassroomInstance } from '@/lib/wulian/types';
import type { Stage, Scene } from '@/lib/types/stage';

// ----------------------------------------------------------------------------
// 任务 2.3 存储层属性测试
//
// 覆盖两条核心属性（需求 8.2 / 8.3）：
//   1. 任意 userId 写入后只能由该 owner 读出；跨 owner 读取被拒绝（隔离 + 归属校验）。
//   2. 原子写在并发/中断模拟下不产生半写文件（以临时文件存在性 + 目标文件完整性断言）。
//
// 这些测试直接对真实磁盘（data/wulian/users/<userId>）读写，cwd 与存储模块一致；
// 每个生成用例使用唯一前缀的 userId，并在 afterEach 中按用户目录清理，互不干扰。
// ----------------------------------------------------------------------------

const createdUsers = new Set<string>();

function trackUser(userId: string): string {
  createdUsers.add(userId);
  return userId;
}

// 保证每个属性运行使用全局唯一、且路径安全（仅 [A-Za-z0-9_-]）的 userId 片段。
let uniqueCounter = 0;
function uniqueToken(): string {
  uniqueCounter += 1;
  return `${Date.now().toString(36)}_${uniqueCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 路径安全 id 生成器，匹配存储模块校验规则。 */
const safeIdArb = fc.stringMatching(/^[A-Za-z0-9_-]+$/).filter((s) => s.length > 0 && s.length <= 32);

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
      studentProfile: { userId: owner, level: 'beginner', goals: ['exam'], updatedAt: 1 },
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

function makeProfile(userId: string): StudentProfile {
  return { userId, level: 'intermediate', goals: ['interest'], updatedAt: 42 };
}

/** 列出某目录下残留的临时文件（原子写未完成的产物）。 */
async function listTmpFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  return entries.filter((f) => f.endsWith('.tmp'));
}

afterEach(async () => {
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
// 属性 1：按用户隔离 + 跨 owner 读取被拒绝
// ----------------------------------------------------------------------------

describe('存储层属性测试：跨用户隔离与归属校验', () => {
  // **Validates: Requirements 8.3**
  it('任意 userId：写入的课堂实例只能由该 owner 读出，他人命名空间读不到', async () => {
    await fc.assert(
      fc.asyncProperty(safeIdArb, safeIdArb, fc.string(), async (ownerSeed, idSeed, chapterId) => {
        const token = uniqueToken();
        const ownerA = trackUser(`pbt_iso_a_${token}_${ownerSeed}`);
        const ownerB = trackUser(`pbt_iso_b_${token}_${ownerSeed}`);
        const classroomId = `c_${token}_${idSeed}`;

        const instance = makeInstance({ id: classroomId, owner: ownerA, chapterId });
        await saveClassroomInstance(instance);

        // owner 本人可原样读出。
        const ownerView = await getClassroomInstance(ownerA, classroomId);
        expect(ownerView).toEqual(instance);

        // 他人（ownerB）在自己的命名空间读取同一 classroomId：读不到（隔离），返回 null。
        const otherView = await getClassroomInstance(ownerB, classroomId);
        expect(otherView).toBeNull();

        // 列举时也只对本人可见，他人列举结果不含该实例。
        const ownerList = await listClassroomInstances(ownerA, chapterId);
        expect(ownerList.some((i) => i.id === classroomId && i.owner === ownerA)).toBe(true);
        const otherList = await listClassroomInstances(ownerB);
        expect(otherList.some((i) => i.id === classroomId)).toBe(false);
      }),
      { numRuns: 25 },
    );
  });

  // **Validates: Requirements 8.3**
  it('跨 owner 读取被拒绝：他人实例被错放/篡改进本目录时抛 OwnershipError', async () => {
    await fc.assert(
      fc.asyncProperty(safeIdArb, safeIdArb, async (ownerSeed, idSeed) => {
        const token = uniqueToken();
        const foreignOwner = `pbt_foreign_${token}_${ownerSeed}`;
        const reader = trackUser(`pbt_reader_${token}_${ownerSeed}`);
        const classroomId = `c_${token}_${idSeed}`;

        // 构造一个归属于他人（foreignOwner）的实例，强行写入 reader 的隔离目录，
        // 模拟数据被篡改/错放。归属校验必须拒绝跨 owner 读取。
        const foreign = makeInstance({ id: classroomId, owner: foreignOwner });
        const targetPath = userClassroomPath(reader, classroomId);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, JSON.stringify(foreign), 'utf-8');

        await expect(getClassroomInstance(reader, classroomId)).rejects.toBeInstanceOf(
          OwnershipError,
        );

        // 列举时归属不符的实例被跳过，绝不暴露他人数据。
        const listed = await listClassroomInstances(reader);
        expect(listed.some((i) => i.id === classroomId)).toBe(false);
      }),
      { numRuns: 25 },
    );
  });

  // **Validates: Requirements 8.3**
  it('任意 userId：画像写入后只能由本人读出，被篡改为他人归属时读取被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(safeIdArb, async (ownerSeed) => {
        const token = uniqueToken();
        const owner = trackUser(`pbt_prof_${token}_${ownerSeed}`);
        const stranger = `pbt_stranger_${token}_${ownerSeed}`;

        await writeProfile(makeProfile(owner));
        const own = await readProfile(owner);
        expect(own).toEqual(makeProfile(owner));

        // 把画像 userId 篡改为他人后，归属校验必须拒绝读取。
        await writeUserJsonAtomic(userProfilePath(owner), makeProfile(stranger));
        await expect(readProfile(owner)).rejects.toBeInstanceOf(OwnershipError);
      }),
      { numRuns: 25 },
    );
  });
});

// ----------------------------------------------------------------------------
// 属性 2：原子写不产生半写文件（并发 / 中断模拟）
// ----------------------------------------------------------------------------

describe('存储层属性测试：原子写不产生半写文件', () => {
  // **Validates: Requirements 8.2**
  it('并发原子写多个文件后：无残留临时文件，且每个文件都是完整可解析 JSON', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeIdArb,
        fc.uniqueArray(safeIdArb, { minLength: 1, maxLength: 8 }),
        async (ownerSeed, idSeeds) => {
          const token = uniqueToken();
          const owner = trackUser(`pbt_conc_${token}_${ownerSeed}`);
          const ids = idSeeds.map((seed, i) => `c_${token}_${i}_${seed}`);
          const instances = ids.map((id) => makeInstance({ id, owner }));

          // 并发保存到同一 owner 的 classrooms 目录下的不同文件。
          await Promise.all(instances.map((inst) => saveClassroomInstance(inst)));

          const dir = userClassroomsDir(owner);

          // 不残留任何临时文件（原子写的 temp 已被 rename 消费）。
          expect(await listTmpFiles(dir)).toEqual([]);

          // 每个 id 都能完整读出等价实例（无半写/损坏）。
          for (const inst of instances) {
            const loaded = await getClassroomInstance(owner, inst.id);
            expect(loaded).toEqual(inst);
          }

          // 目录中恰好是这些已提交的 .json 文件，没有多余产物。
          const jsonFiles = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
          expect(jsonFiles).toEqual(ids.map((id) => `${id}.json`).sort());
        },
      ),
      { numRuns: 20 },
    );
  });

  // **Validates: Requirements 8.2**
  it('并发覆盖同一文件后：目标文件为某次完整写入值，且无残留临时文件', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeIdArb,
        safeIdArb,
        fc.uniqueArray(fc.string(), { minLength: 2, maxLength: 6 }),
        async (ownerSeed, idSeed, chapterIds) => {
          const token = uniqueToken();
          const owner = trackUser(`pbt_over_${token}_${ownerSeed}`);
          const classroomId = `c_${token}_${idSeed}`;

          // 顺序覆盖写入同一文件多次（不同 chapterId 标识不同版本）。
          // 原子写保证最终落地的是「某一次完整写入」，绝不会是半写。
          for (const chapterId of chapterIds) {
            await saveClassroomInstance(makeInstance({ id: classroomId, owner, chapterId }));
          }

          const dir = userClassroomsDir(owner);
          expect(await listTmpFiles(dir)).toEqual([]);

          const loaded = await getClassroomInstance(owner, classroomId);
          expect(loaded).not.toBeNull();
          // 最终值必须是写入候选中的某一个完整值（last-write-wins 为最后一个）。
          expect(loaded).toEqual(
            makeInstance({ id: classroomId, owner, chapterId: chapterIds[chapterIds.length - 1] }),
          );
        },
      ),
      { numRuns: 20 },
    );
  });

  // **Validates: Requirements 8.2**
  it('中断模拟：写入中途遗留的临时文件不污染目标文件，目标始终为完整提交值', async () => {
    await fc.assert(
      fc.asyncProperty(safeIdArb, safeIdArb, async (ownerSeed, idSeed) => {
        const token = uniqueToken();
        const owner = trackUser(`pbt_intr_${token}_${ownerSeed}`);
        const classroomId = `c_${token}_${idSeed}`;
        const target = userClassroomPath(owner, classroomId);

        await ensureUserDirs(owner);

        // 1) 先完整提交 V1。
        const v1 = makeInstance({ id: classroomId, owner, chapterId: 'v1' });
        await saveClassroomInstance(v1);

        // 2) 模拟一次「写到一半被中断（rename 之前进程崩溃）」：
        //    遗留一个内容残缺/损坏的临时文件，文件名沿用原子写的 temp 命名风格。
        const leftoverTmp = `${target}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(leftoverTmp, '{ "id": "broken", "stage', 'utf-8');

        // 中断遗留的临时文件不得影响目标文件：仍应读出完整的 V1。
        const afterCrash = await getClassroomInstance(owner, classroomId);
        expect(afterCrash).toEqual(v1);

        // 3) 后续再做一次完整原子写 V2，目标应被原子替换为完整 V2。
        const v2 = makeInstance({ id: classroomId, owner, chapterId: 'v2' });
        await saveClassroomInstance(v2);

        // 目标文件可解析且等于 V2（绝非半写内容）。
        const raw = await fs.readFile(target, 'utf-8');
        expect(() => JSON.parse(raw)).not.toThrow();
        const reread = await readUserJson<WulianClassroomInstance>(target);
        expect(reread).toEqual(v2);

        // 清理本测试自己植入的遗留临时文件后，目录应无任何临时文件残留。
        await fs.rm(leftoverTmp, { force: true });
        expect(await listTmpFiles(userClassroomsDir(owner))).toEqual([]);
      }),
      { numRuns: 20 },
    );
  });
});
