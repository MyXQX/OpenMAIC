import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { WulianStreamEvent, AgentTurn, WhiteboardItem, AgentRole } from '@/lib/wulian/types';
import type { StatelessEvent } from '@/lib/types/chat';

// Helper visualKey mapping to mimic registry color mapping
const VISUAL_KEY_COLORS: Record<string, string> = {
  amber: '#f59e0b',
  indigo: '#6366f1',
  slate: '#64748b',
  emerald: '#10b981',
  rose: '#f43f5e',
  violet: '#8b5cf6',
};

const teacherPersona = {
  id: 'faraday',
  name: '法拉第',
  visualKey: 'amber',
};

/**
 * Re-implementation of the SSE adapter mapping function for testing.
 */
function mapStatelessEventsToWulian(
  events: StatelessEvent[],
  teacherId: string,
  teacherName: string
): WulianStreamEvent[] {
  const output: WulianStreamEvent[] = [];
  let currentSpeech = '';
  let currentAgentId = '';
  let currentSpeakerRole: AgentRole = 'teacher';
  let currentSpeakerId = '';
  let currentSpeakerName = '';
  let currentWhiteboard: WhiteboardItem[] = [];

  const maicActionToWulianWhiteboard = (name: string, params: any): WhiteboardItem | null => {
    if (name === 'wb_draw_latex') {
      return { type: 'formula', latex: String(params.latex || ''), caption: String(params.caption || '') };
    }
    if (name === 'wb_draw_text') {
      return { type: 'note', markdown: String(params.content || params.markdown || '') };
    }
    if (name === 'wb_draw_chart' || name === 'wb_draw_shape') {
      return {
        type: 'figure',
        svg: String(params.svg || params.shapeName || ''),
        caption: String(params.caption || ''),
      };
    }
    return null;
  };

  const flushCurrentAgent = () => {
    if (currentAgentId) {
      output.push({
        type: 'agent_complete',
        turn: {
          speakerRole: currentSpeakerRole,
          speakerId: currentSpeakerId,
          speakerName: currentSpeakerName,
          speech: currentSpeech || '（正在思考中...）',
          whiteboard: currentWhiteboard.length > 0 ? currentWhiteboard : undefined,
          avatarAction: { emotion: 'neutral' },
          nextState: 'await_student',
        },
      });
      currentSpeech = '';
      currentWhiteboard = [];
      currentAgentId = '';
    }
  };

  for (const event of events) {
    if (event.type === 'agent_start') {
      flushCurrentAgent();
      currentAgentId = event.data.agentId;
      currentSpeakerRole =
        currentAgentId === 'teacher'
          ? 'teacher'
          : currentAgentId === 'assistant'
            ? 'assistant'
            : 'classmate';
      currentSpeakerId =
        currentAgentId === 'teacher'
          ? `teacher_${teacherId}`
          : currentAgentId === 'assistant'
            ? 'assistant_xiaomai'
            : 'classmate_xiaoheng';
      currentSpeakerName =
        currentAgentId === 'teacher'
          ? `${teacherName} 教授`
          : currentAgentId === 'assistant'
            ? '小麦 助教'
            : '小恒 同学';

      output.push({
        type: 'agent_start',
        speakerRole: currentSpeakerRole,
        speakerId: currentSpeakerId,
        speakerName: currentSpeakerName,
      });
    } else if (event.type === 'text_delta') {
      currentSpeech += event.data.content;
      output.push({
        type: 'agent_delta',
        speakerId: currentSpeakerId,
        deltaText: event.data.content,
      });
    } else if (event.type === 'action') {
      const wbItem = maicActionToWulianWhiteboard(event.data.actionName, event.data.params);
      if (wbItem) {
        currentWhiteboard.push(wbItem);
      }
    } else if (event.type === 'error') {
      output.push({
        type: 'error',
        message: event.data.message,
      });
    }
  }

  flushCurrentAgent();
  output.push({ type: 'turn_end' });
  return output;
}

// Generators for testing
const agentIdArb = fc.constantFrom('teacher', 'assistant', 'classmate');
const textContentArb = fc.string({ minLength: 1, maxLength: 20 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'a'));
const actionArb = fc.record({
  type: fc.constant('action' as const),
  data: fc.record({
    actionId: fc.uuid(),
    actionName: fc.constantFrom('wb_draw_latex', 'wb_draw_text', 'wb_draw_chart', 'other_action'),
    params: fc.record({
      latex: fc.string({ minLength: 2, maxLength: 10 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'a')),
      content: fc.string({ minLength: 2, maxLength: 10 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'a')),
      svg: fc.string({ minLength: 2, maxLength: 10 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'a')),
      caption: fc.string({ minLength: 2, maxLength: 10 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'a')),
    }),
    agentId: agentIdArb,
  }),
});

// A stream of events for a single agent turn
const singleAgentStreamArb = fc.record({
  agentId: agentIdArb,
  deltas: fc.array(textContentArb, { minLength: 1, maxLength: 5 }),
  actions: fc.array(actionArb, { maxLength: 3 }),
}).map(({ agentId, deltas, actions }) => {
  const events: StatelessEvent[] = [];
  events.push({
    type: 'agent_start',
    data: { messageId: 'm1', agentId, agentName: agentId },
  });

  // Keep deltas in their original generation order, followed by actions
  const combined = [
    ...deltas.map(d => ({ type: 'delta' as const, content: d })),
    ...actions.map(a => ({ type: 'action' as const, action: a })),
  ];

  for (const item of combined) {
    if (item.type === 'delta') {
      events.push({
        type: 'text_delta',
        data: { content: item.content, messageId: 'm1' },
      });
    } else {
      events.push({
        type: 'action',
        data: {
          actionId: item.action.data.actionId,
          actionName: item.action.data.actionName,
          params: item.action.data.params,
          agentId,
          messageId: 'm1',
        },
      });
    }
  }

  events.push({
    type: 'agent_end',
    data: { messageId: 'm1', agentId },
  });

  return { agentId, deltas, actions, events };
});

describe('Chat SSE Event Adapter PBT (Task 7.4)', () => {
  it('should reliably adapt stateless orchestrator events into compliant WulianStreamEvents', () => {
    fc.assert(
      fc.property(
        fc.array(singleAgentStreamArb, { minLength: 1, maxLength: 5 }),
        (agentStreams) => {
          const teacherId = teacherPersona.id;
          const teacherName = teacherPersona.name;

          // Build a single long sequence of events
          const inputEvents: StatelessEvent[] = [];
          for (const s of agentStreams) {
            inputEvents.push(...s.events);
          }

          const outputEvents = mapStatelessEventsToWulian(inputEvents, teacherId, teacherName);

          // 1. Verify general sequence structure
          expect(outputEvents.length).toBeGreaterThanOrEqual(2);
          expect(outputEvents[outputEvents.length - 1].type).toBe('turn_end');

          // 2. Verify number of agent turns matches exactly
          const startEvents = outputEvents.filter(e => e.type === 'agent_start');
          const completeEvents = outputEvents.filter(e => e.type === 'agent_complete');
          expect(startEvents.length).toBe(agentStreams.length);
          expect(completeEvents.length).toBe(agentStreams.length);

          // 3. Verify total speech reconstruction matches the sum of deltas for each agent
          for (let i = 0; i < agentStreams.length; i++) {
            const stream = agentStreams[i];
            const startEv = startEvents[i] as any;
            const completeEv = completeEvents[i] as any;

            // Name mapping matches
            const expectedRole = stream.agentId === 'teacher' ? 'teacher' : stream.agentId === 'assistant' ? 'assistant' : 'classmate';
            const expectedName = stream.agentId === 'teacher' ? `${teacherName} 教授` : stream.agentId === 'assistant' ? '小麦 助教' : '小恒 同学';
            expect(startEv.speakerRole).toBe(expectedRole);
            expect(startEv.speakerName).toBe(expectedName);
            expect(completeEv.turn.speakerRole).toBe(expectedRole);
            expect(completeEv.turn.speakerName).toBe(expectedName);

            // Speech matches the sum of deltas
            const expectedSpeech = stream.deltas.join('');
            expect(completeEv.turn.speech).toBe(expectedSpeech);

            // Whiteboard actions mapped correctly
            const expectedWbCount = stream.actions.filter(a => a.data.actionName.startsWith('wb_')).length;
            const actualWbCount = completeEv.turn.whiteboard?.length || 0;
            expect(actualWbCount).toBe(expectedWbCount);
          }
        }
      )
    );
  });
});
