// Example that creates a task graph from the issues directory
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse a markdown file to extract task information
function parseIssueFile(filename, content) {
  const lines = content.split('\n');
  
  // Extract title (first # heading)
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : filename.replace('.md', '');
  
  // Extract task description (## Task section)
  const taskMatch = content.match(/##\s+Task\s+([\s\S]*?)(?=##|$)/);
  const description = taskMatch ? taskMatch[1].trim() : '';
  
  // Extract checklist items from Required investigation and Acceptance criteria
  const investigationMatch = content.match(/##\s+Required investigation\s+([\s\S]*?)(?=##|$)/);
  const acceptanceMatch = content.match(/##\s+Acceptance criteria\s+([\s\S]*?)(?=##|$)/);
  
  const checklistItems = [];
  
  if (investigationMatch) {
    const items = investigationMatch[1].match(/- \[ \](.+)/g) || [];
    checklistItems.push(...items.map(item => item.replace(/- \[ \]/, '').trim()));
  }
  
  if (acceptanceMatch) {
    const items = acceptanceMatch[1].match(/- \[ \](.+)/g) || [];
    checklistItems.push(...items.map(item => item.replace(/- \[ \]/, '').trim()));
  }
  
  return {
    id: filename.replace('.md', ''),
    title,
    description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
    checklistItems,
  };
}

// Read and parse all issue files
async function loadIssues() {
  const issuesDir = join(__dirname, '..', 'issues');
  
  try {
    const files = await readdir(issuesDir);
    const markdownFiles = files.filter(f => f.endsWith('.md'));
    
    const issues = [];
    for (const file of markdownFiles) {
      const content = await readFile(join(issuesDir, file), 'utf-8');
      const issue = parseIssueFile(file, content);
      issues.push(issue);
    }
    
    return issues;
  } catch (error) {
    console.error('Error loading issues:', error);
    return [];
  }
}

export default async ({ defTaskGraph, defData, defSystem, $ }) => {
  // Load issues from the issues directory
  const issues = await loadIssues();
  
  console.log(`Loaded ${issues.length} issues from issues directory`);
  
  // Create TaskNode objects for the task graph
  const taskNodes = issues.map(issue => ({
    id: issue.id,
    title: issue.title,
    description: issue.description,
    status: 'pending',
    dependencies: [],
    unblocks: [],
    required_capabilities: ['code-analysis', 'testing', 'mock-models'],
  }));
  
  // Initialize the task graph
  const [graph, setGraph] = defTaskGraph(taskNodes);
  
  // Add task details as data for reference
  defData('ISSUES', issues.map(i => ({
    id: i.id,
    title: i.title,
    checklist_count: i.checklistItems.length,
  })));
  
  defSystem('role', 'You are a senior software engineer tasked with investigating and validating the lmthing library codebase.');
  
  defSystem('instructions', `
Your goal is to systematically work through the task graph to investigate each API method.

For each task:
1. Use getUnblockedTasks to find tasks that are ready to start
2. Use updateTaskStatus to mark tasks as in_progress when you begin
3. Complete the investigation according to the task description
4. Use updateTaskStatus with output_result to mark tasks as completed

Focus on one task at a time and provide thorough analysis.
  `);
  
  $`Please analyze the task graph and identify which tasks should be started first. Use getUnblockedTasks to see which tasks are ready to start.`;
};

export const config = {
  model: 'mock'
};

export const mock = [
  { type: 'text', text: 'Let me check which tasks are ready to start.' },
  { type: 'tool-call', toolCallId: 'call_1', toolName: 'getUnblockedTasks', args: {} },
  { type: 'text', text: '\n\nGreat! All 12 investigation tasks are ready to start since they have no dependencies:\n\n' },
  { type: 'text', text: '1. def - Investigate `def`\n' },
  { type: 'text', text: '2. defAgent - Investigate `defAgent`\n' },
  { type: 'text', text: '3. defData - Investigate `defData`\n' },
  { type: 'text', text: '4. defEffect - Investigate plugin `defEffect`\n' },
  { type: 'text', text: '5. defFunction - Investigate plugin `defFunction`\n' },
  { type: 'text', text: '6. defFunctionAgent - Investigate plugin `defFunctionAgent`\n' },
  { type: 'text', text: '7. defMessage - Investigate `defMessage`\n' },
  { type: 'text', text: '8. defState - Investigate `defState`\n' },
  { type: 'text', text: '9. defSystem - Investigate `defSystem`\n' },
  { type: 'text', text: '10. defTaskGraph - Investigate plugin `defTaskGraph`\n' },
  { type: 'text', text: '11. defTaskList - Investigate plugin `defTaskList`\n' },
  { type: 'text', text: '12. defTool - Investigate `defTool`\n\n' },
  { type: 'text', text: 'Each task requires code-analysis, testing, and mock-models capabilities.' },
];
