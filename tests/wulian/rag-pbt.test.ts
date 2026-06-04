import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatRetrievalForGeneration } from '@/lib/wulian/rag/store';
import type { RetrievedChunk } from '@/lib/wulian/types';

// Use standard fc.string() and map to sanitise character content to standard alphanumeric only.
const safeWordGen = fc.string({ minLength: 5, maxLength: 20 }).map(
  (s) => s.replace(/[^a-zA-Z0-9]/g, 'a') || 'safe'
);
const safeTextGen = fc.string({ minLength: 10, maxLength: 100 }).map(
  (s) => s.replace(/[^a-zA-Z0-9]/g, 'a') || 'safeText'
);

const retrievedChunkArb = fc.record({
  id: fc.uuid(),
  text: safeTextGen,
  score: fc.double({ min: 0.1, max: 1.0 }),
  source: fc.constantFrom('builtin', 'uploaded') as fc.Arbitrary<'builtin' | 'uploaded'>,
  sourceLabel: safeWordGen,
});

describe('RAG Context Formatting PBT (Task 5.3)', () => {
  // Requirement 2.6: Empty chunks return "general textbook" hint and don't throw
  it('should return default textbook prompt when no chunks are found', () => {
    fc.assert(
      fc.property(fc.constantFrom('course', 'mine', 'compare') as fc.Arbitrary<'course' | 'mine' | 'compare'>, (mode) => {
        const result = formatRetrievalForGeneration([], mode);
        expect(result).toContain('未检索到相关资料');
        expect(result).toContain('以下内容将基于一般教材');
      })
    );
  });

  // Requirement 2.1 & 2.5: Citations numbers correspond 1-to-1 and texts are preserved
  it('should preserve text and source labels, and generate exact citation sequence', () => {
    fc.assert(
      fc.property(
        fc.array(retrievedChunkArb, { minLength: 1, maxLength: 20 }),
        fc.constantFrom('course', 'mine') as fc.Arbitrary<'course' | 'mine'>,
        (chunks, mode) => {
          const result = formatRetrievalForGeneration(chunks, mode);

          // All chunk texts and source labels should be present
          for (const chunk of chunks) {
            expect(result).toContain(chunk.text.trim());
            expect(result).toContain(chunk.sourceLabel);
          }

          // Exact citation numbers [#1] through [#N] must exist
          for (let i = 1; i <= chunks.length; i++) {
            expect(result).toContain(`[#${i}]`);
          }

          // Total citation references matching [#number] regex must equal chunks.length
          const matches = result.match(/\[#\d+\]/g) || [];
          expect(matches.length).toBe(chunks.length);
        }
      )
    );
  });

  // Requirement 2.2: Compare mode grouped formatting and sequence mapping
  it('should group builtin and uploaded chunks correctly in compare mode', () => {
    fc.assert(
      fc.property(
        fc.array(retrievedChunkArb, { minLength: 1, maxLength: 20 }),
        (chunks) => {
          const result = formatRetrievalForGeneration(chunks, 'compare');
          
          const builtinChunks = chunks.filter((c) => c.source === 'builtin');
          const uploadedChunks = chunks.filter((c) => c.source === 'uploaded');

          // Header containment checks
          if (builtinChunks.length > 0) {
            expect(result).toContain('### 课程内置教材');
          } else {
            expect(result).not.toContain('### 课程内置教材');
          }

          if (uploadedChunks.length > 0) {
            expect(result).toContain('### 用户上传资料');
          } else {
            expect(result).not.toContain('### 用户上传资料');
          }

          // Sequencing checks
          if (builtinChunks.length > 0 && uploadedChunks.length > 0) {
            const builtinHeaderIndex = result.indexOf('### 课程内置教材');
            const uploadedHeaderIndex = result.indexOf('### 用户上传资料');
            
            // Builtin group must precede uploaded group
            expect(builtinHeaderIndex).toBeLessThan(uploadedHeaderIndex);

            // Builtin chunks must appear before uploaded header
            for (const bc of builtinChunks) {
              const chunkIndex = result.indexOf(bc.text.trim(), builtinHeaderIndex);
              expect(chunkIndex).toBeGreaterThan(builtinHeaderIndex);
              expect(chunkIndex).toBeLessThan(uploadedHeaderIndex);
            }

            // Uploaded chunks must appear after uploaded header
            for (const uc of uploadedChunks) {
              const chunkIndex = result.indexOf(uc.text.trim(), uploadedHeaderIndex);
              expect(chunkIndex).toBeGreaterThan(uploadedHeaderIndex);
            }
          }

          // Citations total count
          const matches = result.match(/\[#\d+\]/g) || [];
          expect(matches.length).toBe(chunks.length);

          // All indices 1 to N are referenced
          for (let i = 1; i <= chunks.length; i++) {
            expect(result).toContain(`[#${i}]`);
          }
        }
      )
    );
  });
});
