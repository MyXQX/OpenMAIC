import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import { buildGenerationRequirements } from '@/lib/wulian/personalize/build-requirements';
import type { WulianPersonalizationInput } from '@/lib/wulian/types';
import { clearChapterCache } from '@/lib/wulian/agents/chapter';
import { clearPersonaCache } from '@/lib/wulian/agents/persona';

// Pre-define valid domain constants from registry/content
const VALID_CHAPTER_IDS = ['em-induction', 'photoelectric', 'double-slit', 'newton-laws'];
const VALID_SIMULATOR_IDS = ['flux-loop-slider', 'photoelectric', 'double-slit', 'newton-block'];

const studentProfileArb = fc.record({
  userId: fc.string({ minLength: 5, maxLength: 20 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'a')),
  gradeOrMajor: fc.option(fc.string({ minLength: 2, maxLength: 15 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'a')), { nil: undefined }),
  level: fc.constantFrom('beginner', 'intermediate', 'advanced') as fc.Arbitrary<'beginner' | 'intermediate' | 'advanced'>,
  goals: fc.uniqueArray(fc.constantFrom('exam', 'interest', 'research') as fc.Arbitrary<'exam' | 'interest' | 'research'>, { minLength: 1, maxLength: 3 }),
  pacePreference: fc.option(fc.constantFrom('slow', 'normal', 'fast') as fc.Arbitrary<'slow' | 'normal' | 'fast'>, { nil: undefined }),
  preferredScientistTone: fc.option(fc.string(), { nil: undefined }),
  updatedAt: fc.integer({ min: 0 }),
});

const personalizationInputArb = fc.record({
  chapterId: fc.constantFrom(...VALID_CHAPTER_IDS),
  studentProfile: studentProfileArb,
  materialMode: fc.constantFrom('course', 'mine', 'compare') as fc.Arbitrary<'course' | 'mine' | 'compare'>,
  uploadedDocIds: fc.array(fc.string({ minLength: 5, maxLength: 10 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'a')), { maxLength: 3 }),
  selectedSimulatorIds: fc.uniqueArray(fc.constantFrom(...VALID_SIMULATOR_IDS), { maxLength: 2 }),
  extraInstructions: fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: undefined }),
}) as fc.Arbitrary<WulianPersonalizationInput>;

describe('Generation Adapter PBT (Task 6.6)', () => {
  beforeAll(() => {
    // Clear caches to ensure filesystem loads correctly
    clearChapterCache();
    clearPersonaCache();
  });

  it('should successfully map personalization inputs to UserRequirements and pdfContent', async () => {
    // Run async PBT properties
    await fc.assert(
      fc.asyncProperty(personalizationInputArb, async (input) => {
        const userId = 'test_user_pbt';
        const result = await buildGenerationRequirements(input, userId);

        expect(result).toBeDefined();
        expect(result.requirements).toBeDefined();
        expect(result.requirements.requirement).toBeTypeOf('string');
        expect(result.requirements.interactiveMode).toBe(true); // Must be interactive-first

        const reqText = result.requirements.requirement;

        // 1. Verify student profile details are present
        expect(reqText).toContain('学生画像与个性化设置');
        if (input.studentProfile.gradeOrMajor) {
          expect(reqText).toContain(input.studentProfile.gradeOrMajor);
        } else {
          expect(reqText).toContain('未指定');
        }

        // 2. Verify level mapping
        if (input.studentProfile.level === 'beginner') {
          expect(reqText).toContain('物理入门基础');
        } else if (input.studentProfile.level === 'intermediate') {
          expect(reqText).toContain('物理进阶水平');
        } else {
          expect(reqText).toContain('物理高级/专业水平');
        }

        // 3. Verify simulator constraints mapping
        if (input.selectedSimulatorIds.length > 0) {
          expect(reqText).toContain('物理模拟器课件嵌入约束');
          for (const simId of input.selectedSimulatorIds) {
            expect(reqText).toContain(simId);
          }
        }

        // 4. Verify RAG context output
        expect(result.pdfContent).toBeDefined();
        expect(result.pdfContent?.text).toBeTypeOf('string');
        
        // 5. Verify extra instructions mapping
        if (input.extraInstructions) {
          expect(reqText).toContain('学生额外自定义指令');
          expect(reqText).toContain(input.extraInstructions);
        }
      }),
      { numRuns: 20 } // Limit async runs to keep it fast
    );
  });
});
