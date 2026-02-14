import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createCompositeSchema, buildEnhancedDescription } from './CompositeExecutor';

describe('createCompositeSchema', () => {
  it('creates a schema with calls array from sub-definitions', () => {
    const subs = [
      { name: 'write', description: 'Write a file', inputSchema: z.object({ path: z.string() }) },
      { name: 'read', description: 'Read a file', inputSchema: z.object({ path: z.string() }) },
    ];

    const schema = createCompositeSchema(subs, 'sub-tool');

    // Validate a valid input
    const validInput = {
      calls: [
        { name: 'write', args: { path: '/a.txt' } },
        { name: 'read', args: { path: '/b.txt' } },
      ]
    };
    const result = schema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects invalid input', () => {
    const subs = [
      { name: 'write', description: 'Write a file', inputSchema: z.object({ path: z.string() }) },
      { name: 'read', description: 'Read a file', inputSchema: z.object({ path: z.string() }) },
    ];

    const schema = createCompositeSchema(subs, 'sub-tool');

    // Missing calls property
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('buildEnhancedDescription', () => {
  it('builds description with sub-item list', () => {
    const subs = [
      { name: 'write', description: 'Write a file', inputSchema: z.object({}) },
      { name: 'read', description: 'Read a file', inputSchema: z.object({}) },
    ];

    const desc = buildEnhancedDescription('File operations', subs, 'sub-tools');

    expect(desc).toContain('File operations');
    expect(desc).toContain('Available sub-tools:');
    expect(desc).toContain('write: Write a file');
    expect(desc).toContain('read: Read a file');
  });
});
