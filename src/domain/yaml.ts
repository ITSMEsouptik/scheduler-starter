import { WorkflowSpec, WorkflowSpecT } from './types.js';
import YAML from 'yaml';

export function parseWorkflowYAML(yamlStr: string): WorkflowSpecT {
  const obj = YAML.parse(yamlStr);
  const parsed = WorkflowSpec.parse(obj);
  const names = new Set<string>();
  for (const t of parsed.tasks) {
    if (names.has(t.name)) throw new Error(`Duplicate task name: ${t.name}`);
    names.add(t.name);
    t.dependsOn.forEach(d => {
      if (!parsed.tasks.find(x => x.name === d)) {
        throw new Error(`Task ${t.name} depends on unknown task ${d}`);
      }
    });
  }
  return parsed;
}
