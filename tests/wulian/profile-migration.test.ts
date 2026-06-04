import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readProfile, writeProfile, getClassroomInstance, saveClassroomInstance } from '@/lib/wulian/storage';
import { migrateLocalDataToAccount } from '@/lib/wulian/auth/migration';
import type { StudentProfile, WulianClassroomInstance } from '@/lib/wulian/types';
import { DATA_ROOT } from '@/lib/wulian/storage';

const TEST_USER = 'test-user-migration';
const TEST_GUEST = 'guest';

// Mock Stage structure for classroom instance
const MOCK_STAGE = {
  id: 'stg123',
  name: 'Test Stage',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const MOCK_PERSONALIZATION = {
  chapterId: 'em-induction',
  studentProfile: { userId: TEST_GUEST, level: 'beginner' as const, goals: ['interest' as const], updatedAt: Date.now() },
  materialMode: 'course' as const,
  uploadedDocIds: [],
  selectedSimulatorIds: [],
};

const MOCK_CLASSROOM: WulianClassroomInstance = {
  id: 'class123',
  owner: TEST_GUEST,
  chapterId: 'em-induction',
  stage: MOCK_STAGE,
  scenes: [],
  personalization: MOCK_PERSONALIZATION,
  simulators: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('Student Profile and Local Data Migration', () => {
  beforeEach(async () => {
    // Clean up test user directory before each test
    const userDir = path.join(DATA_ROOT, 'users', TEST_USER);
    await fs.rm(userDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should write and read student profiles with user isolation', async () => {
    const profile: StudentProfile = {
      userId: TEST_USER,
      gradeOrMajor: 'Physics Major',
      level: 'advanced',
      goals: ['research'],
      pacePreference: 'normal',
      updatedAt: Date.now(),
    };

    // Save profile
    await writeProfile(profile);

    // Read profile back
    const read = await readProfile(TEST_USER);
    expect(read).not.toBeNull();
    expect(read?.userId).toBe(TEST_USER);
    expect(read?.gradeOrMajor).toBe('Physics Major');
    expect(read?.level).toBe('advanced');
    expect(read?.goals).toContain('research');
  });

  it('should migrate visitor local profile and classrooms to logged-in user account', async () => {
    const localProfile: StudentProfile = {
      userId: TEST_GUEST,
      gradeOrMajor: 'Freshman',
      level: 'beginner',
      goals: ['interest'],
      updatedAt: Date.now(),
    };

    const localClassrooms = [
      {
        ...MOCK_CLASSROOM,
        id: 'c1',
      },
      {
        ...MOCK_CLASSROOM,
        id: 'c2',
      },
    ];

    // Trigger migration
    const result = await migrateLocalDataToAccount(TEST_USER, {
      profile: localProfile,
      classrooms: localClassrooms,
    });

    expect(result.profileMigrated).toBe(true);
    expect(result.migratedCount).toBe(2);
    expect(result.conflictCount).toBe(0);

    // Verify profile is migrated under TEST_USER
    const migratedProfile = await readProfile(TEST_USER);
    expect(migratedProfile).not.toBeNull();
    expect(migratedProfile?.userId).toBe(TEST_USER);
    expect(migratedProfile?.gradeOrMajor).toBe('Freshman');

    // Verify classrooms are migrated with owner update
    const migratedC1 = await getClassroomInstance(TEST_USER, 'c1');
    expect(migratedC1).not.toBeNull();
    expect(migratedC1?.owner).toBe(TEST_USER);

    const migratedC2 = await getClassroomInstance(TEST_USER, 'c2');
    expect(migratedC2).not.toBeNull();
    expect(migratedC2?.owner).toBe(TEST_USER);
  });

  it('should skip migrating classroom instances if they already exist on server (conflict validation)', async () => {
    // 1. Create a classroom pre-existing on the server for TEST_USER
    const existingServerClassroom: WulianClassroomInstance = {
      ...MOCK_CLASSROOM,
      id: 'conflict1',
      owner: TEST_USER,
      chapterId: 'em-induction',
      updatedAt: new Date().toISOString(),
    };
    await saveClassroomInstance(existingServerClassroom);

    // 2. Local has 2 classrooms: one is conflict1, the other is c_new
    const localClassrooms = [
      {
        ...MOCK_CLASSROOM,
        id: 'conflict1', // exists
      },
      {
        ...MOCK_CLASSROOM,
        id: 'c_new', // new
      },
    ];

    const result = await migrateLocalDataToAccount(TEST_USER, {
      classrooms: localClassrooms,
    });

    expect(result.migratedCount).toBe(1);
    expect(result.conflictCount).toBe(1);

    // Verify 'c_new' is migrated
    const cNew = await getClassroomInstance(TEST_USER, 'c_new');
    expect(cNew).not.toBeNull();
    expect(cNew?.owner).toBe(TEST_USER);

    // Verify conflict1 remains unchanged as owner: TEST_USER
    const conflict1 = await getClassroomInstance(TEST_USER, 'conflict1');
    expect(conflict1).not.toBeNull();
    expect(conflict1?.owner).toBe(TEST_USER);
  });
});
