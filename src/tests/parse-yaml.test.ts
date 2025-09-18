import { describe, it, expect } from 'vitest';
import { parseWorkflowYAML } from '../domain/yaml.js';

const good = `
name: unit-good
version: 1
tasks:
  - name: A
    type: echo
  - name: B
    type: echo
    dependsOn: [A]
`;

const dup = `
name: unit-dup
version: 1
tasks:
  - name: A
  - name: A
`;

const unknownDep = `
name: unit-unknown
version: 1
tasks:
  - name: A
    dependsOn: [Z]
`;

describe('parseWorkflowYAML', () => {
  it('parses a valid spec', () => {
    const spec = parseWorkflowYAML(good);
    expect(spec.name).toBe('unit-good');
    expect(spec.tasks.length).toBe(2);
  });

  it('throws on duplicate task names', () => {
    expect(() => parseWorkflowYAML(dup)).toThrow();
  });

  it('throws on unknown dependency', () => {
    expect(() => parseWorkflowYAML(unknownDep)).toThrow();
  });
});
