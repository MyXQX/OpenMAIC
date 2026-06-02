import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type {
  StudentProfile,
  WulianPersonalizationInput,
  WulianClassroomInstance,
  SimulatorDefinition,
  SimulatorParam,
} from '@/lib/wulian/types';
import type { Stage, Scene } from '@/lib/types/stage';

// ----------------------------------------------------------------------------
// Smart generators — constrained to the valid input space of each type.
// JSON round-trip only holds for values that survive JSON.stringify, so the
// generators avoid `undefined`-valued optional fields (which JSON drops) by
// using fc.option(..., { nil: undefined }) and stripping them before compare.
// ----------------------------------------------------------------------------

/** Finite JSON-safe number (no NaN/Infinity, which JSON.stringify turns to null). */
const jsonSafeNumber = fc.double({ noNaN: true, noDefaultInfinity: true });

/** Drop keys whose value is `undefined` so equality matches post-JSON shape. */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const studentProfileArb: fc.Arbitrary<StudentProfile> = fc.record({
  userId: fc.string(),
  gradeOrMajor: fc.option(fc.string(), { nil: undefined }),
  level: fc.constantFrom('beginner', 'intermediate', 'advanced'),
  goals: fc.uniqueArray(fc.constantFrom('exam', 'interest', 'research')),
  pacePreference: fc.option(fc.constantFrom('slow', 'normal', 'fast'), { nil: undefined }),
  preferredScientistTone: fc.option(fc.string(), { nil: undefined }),
  updatedAt: fc.integer({ min: 0 }),
}) as fc.Arbitrary<StudentProfile>;

const personalizationArb: fc.Arbitrary<WulianPersonalizationInput> = fc.record({
  chapterId: fc.string(),
  studentProfile: studentProfileArb,
  materialMode: fc.constantFrom('course', 'mine', 'compare'),
  uploadedDocIds: fc.array(fc.string()),
  selectedSimulatorIds: fc.array(fc.string()),
  extraInstructions: fc.option(fc.string(), { nil: undefined }),
}) as fc.Arbitrary<WulianPersonalizationInput>;

/**
 * Minimal-but-valid Stage generator. The round-trip property only needs a
 * JSON-serializable object that conforms to the Stage type; we keep optional
 * fields sparse to focus the property on the wulian wrapper.
 */
const stageArb: fc.Arbitrary<Stage> = fc.record({
  id: fc.string(),
  name: fc.string(),
  description: fc.option(fc.string(), { nil: undefined }),
  createdAt: fc.integer({ min: 0 }),
  updatedAt: fc.integer({ min: 0 }),
  agentIds: fc.option(fc.array(fc.string()), { nil: undefined }),
  interactiveMode: fc.option(fc.boolean(), { nil: undefined }),
}) as fc.Arbitrary<Stage>;

/** Minimal-but-valid Scene generator (quiz/interactive content kept simple). */
const sceneArb: fc.Arbitrary<Scene> = fc
  .record({
    id: fc.string(),
    stageId: fc.string(),
    type: fc.constant('quiz' as const),
    title: fc.string(),
    order: fc.integer({ min: 0 }),
    content: fc.record({
      type: fc.constant('quiz' as const),
      questions: fc.constant([]),
    }),
  })
  .map((s) => s as unknown as Scene);

const classroomInstanceArb: fc.Arbitrary<WulianClassroomInstance> = fc.record({
  id: fc.string(),
  owner: fc.string(),
  chapterId: fc.string(),
  stage: stageArb,
  scenes: fc.array(sceneArb, { maxLength: 4 }),
  personalization: personalizationArb,
  simulators: fc.array(fc.string()),
  createdAt: fc.string(),
  updatedAt: fc.string(),
}) as fc.Arbitrary<WulianClassroomInstance>;

/**
 * Smart generator that guarantees the range invariant min ≤ default ≤ max by
 * construction: pick three sorted finite numbers and assign in order.
 */
const simulatorParamArb: fc.Arbitrary<SimulatorParam> = fc
  .tuple(jsonSafeNumber, jsonSafeNumber, jsonSafeNumber)
  .map(([a, b, c]) => {
    const [min, def, max] = [a, b, c].sort((x, y) => x - y);
    return { key: 'k', label: 'l', min, max, default: def };
  })
  .chain((base) =>
    fc.record({
      key: fc.string(),
      label: fc.string(),
      min: fc.constant(base.min),
      max: fc.constant(base.max),
      default: fc.constant(base.default),
      unit: fc.option(fc.string(), { nil: undefined }),
    }),
  ) as fc.Arbitrary<SimulatorParam>;

const simulatorDefinitionArb: fc.Arbitrary<SimulatorDefinition> = fc.record({
  id: fc.string(),
  title: fc.string(),
  subject: fc.constantFrom('力学', '电磁学', '光学', '近代物理'),
  knowledgePointHint: fc.option(fc.string(), { nil: undefined }),
  params: fc.array(simulatorParamArb, { maxLength: 8 }),
}) as fc.Arbitrary<SimulatorDefinition>;

// ----------------------------------------------------------------------------
// Property tests
// ----------------------------------------------------------------------------

describe('类型层属性测试：JSON 序列化往返一致', () => {
  // **Validates: Requirements 8**
  it('WulianPersonalizationInput 经 JSON.stringify→parse 后保持等价', () => {
    fc.assert(
      fc.property(personalizationArb, (input) => {
        const expected = stripUndefined(input);
        const roundTripped = JSON.parse(JSON.stringify(input)) as WulianPersonalizationInput;
        expect(roundTripped).toEqual(expected);
      }),
    );
  });

  // **Validates: Requirements 8**
  it('WulianClassroomInstance 经 JSON.stringify→parse 后保持等价', () => {
    fc.assert(
      fc.property(classroomInstanceArb, (instance) => {
        const expected = stripUndefined(instance);
        const roundTripped = JSON.parse(JSON.stringify(instance)) as WulianClassroomInstance;
        expect(roundTripped).toEqual(expected);
      }),
    );
  });
});

describe('类型层属性测试：SimulatorDefinition.params 范围不变量', () => {
  // **Validates: Requirements 3**
  it('每个参数满足 min ≤ default ≤ max', () => {
    fc.assert(
      fc.property(simulatorDefinitionArb, (def) => {
        for (const param of def.params) {
          expect(param.min).toBeLessThanOrEqual(param.default);
          expect(param.default).toBeLessThanOrEqual(param.max);
        }
      }),
    );
  });

  // **Validates: Requirements 3, 8** — invariant survives serialization.
  it('范围不变量在 JSON 往返后仍然成立', () => {
    fc.assert(
      fc.property(simulatorDefinitionArb, (def) => {
        const roundTripped = JSON.parse(JSON.stringify(def)) as SimulatorDefinition;
        expect(roundTripped).toEqual(stripUndefined(def));
        for (const param of roundTripped.params) {
          expect(param.min).toBeLessThanOrEqual(param.default);
          expect(param.default).toBeLessThanOrEqual(param.max);
        }
      }),
    );
  });
});

// ----------------------------------------------------------------------------
// Unit tests — concrete examples and edge cases complementing the properties.
// ----------------------------------------------------------------------------

describe('类型层单元测试：具体示例与边界', () => {
  it('完整 WulianClassroomInstance 示例 JSON 往返保持一致', () => {
    const instance: WulianClassroomInstance = {
      id: 'inst-1',
      owner: 'user-1',
      chapterId: 'em-induction',
      stage: {
        id: 'stage-1',
        name: '电磁感应',
        createdAt: 1,
        updatedAt: 2,
      },
      scenes: [
        {
          id: 'scene-1',
          stageId: 'stage-1',
          type: 'slide',
          title: '法拉第定律',
          order: 0,
          // canvas is a PPTist Slide; an empty object is sufficient for the
          // serialization round-trip example and avoids importing Slide here.
          content: { type: 'slide', canvas: {} as never },
        },
      ],
      personalization: {
        chapterId: 'em-induction',
        studentProfile: {
          userId: 'user-1',
          level: 'beginner',
          goals: ['exam', 'interest'],
          updatedAt: 100,
        },
        materialMode: 'compare',
        uploadedDocIds: ['doc-1'],
        selectedSimulatorIds: ['flux-loop-slider'],
      },
      simulators: ['flux-loop-slider'],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    };
    expect(JSON.parse(JSON.stringify(instance))).toEqual(instance);
  });

  it('SimulatorDefinition 等值边界 min = default = max 合法', () => {
    const def: SimulatorDefinition = {
      id: 'photoelectric',
      title: '光电效应',
      subject: '近代物理',
      params: [{ key: 'freq', label: '频率', min: 5, max: 5, default: 5, unit: 'THz' }],
    };
    for (const p of def.params) {
      expect(p.min).toBeLessThanOrEqual(p.default);
      expect(p.default).toBeLessThanOrEqual(p.max);
    }
    expect(JSON.parse(JSON.stringify(def))).toEqual(def);
  });

  it('空 params 的 SimulatorDefinition 往返一致', () => {
    const def: SimulatorDefinition = {
      id: 'double-slit',
      title: '双缝干涉',
      subject: '光学',
      params: [],
    };
    expect(JSON.parse(JSON.stringify(def))).toEqual(def);
  });
});
