import { saveClassroomInstance, getClassroomInstance, writeProfile, readProfile } from '../storage';
import type { StudentProfile, WulianClassroomInstance } from '../types';

export interface MigrationResult {
  migratedCount: number;
  conflictCount: number;
  profileMigrated: boolean;
}

/**
 * 将本地访客模式的数据（画像、定制课堂实例）迁移到已登录账号。
 * 如果某个实例 ID 已在服务端存在，则以服务端为准（即不覆盖），并记录为冲突。
 */
export async function migrateLocalDataToAccount(
  userId: string,
  localData: {
    profile?: StudentProfile;
    classrooms?: WulianClassroomInstance[];
  }
): Promise<MigrationResult> {
  let migratedCount = 0;
  let conflictCount = 0;
  let profileMigrated = false;

  // 1. 迁移用户画像（如果服务端尚无画像，或者本地画像更新）
  if (localData.profile) {
    const serverProfile = await readProfile(userId).catch(() => null);
    if (!serverProfile) {
      await writeProfile({
        ...localData.profile,
        userId,
        updatedAt: Date.now(),
      });
      profileMigrated = true;
    }
  }

  // 2. 迁移课堂实例
  if (localData.classrooms && localData.classrooms.length > 0) {
    for (const inst of localData.classrooms) {
      try {
        const serverInst = await getClassroomInstance(userId, inst.id).catch(() => null);
        if (serverInst) {
          // 服务端已有同名实例，冲突，以服务端为准
          conflictCount++;
        } else {
          // 写入服务端，强制修改 owner 为当前用户
          const migratedInst: WulianClassroomInstance = {
            ...inst,
            owner: userId,
            updatedAt: new Date().toISOString(),
          };
          await saveClassroomInstance(migratedInst);
          migratedCount++;
        }
      } catch (e) {
        console.error(`Migration failed for classroom ${inst.id}:`, e);
        conflictCount++;
      }
    }
  }

  return { migratedCount, conflictCount, profileMigrated };
}
