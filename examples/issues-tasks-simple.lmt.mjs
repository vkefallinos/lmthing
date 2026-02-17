// Alternative example using defTaskList instead of defTaskGraph
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
  
  return {
    id: filename.replace('.md', ''),
    name: title,
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

export default async ({ defTaskList, defSystem, $ }) => {
  // Load issues from the issues directory
  const issues = await loadIssues();
  
  console.log(`Loaded ${issues.length} issues from issues directory`);
  
  // Create Task objects for the task list
  const tasks = issues.map((issue, index) => ({
    id: String(index + 1),
    name: issue.name,
    status: 'pending',
  }));
  
  // Initialize the task list
  const [taskList, setTaskList] = defTaskList(tasks);
  
  defSystem('role', 'You are a senior software engineer tasked with investigating and validating the lmthing library codebase.');
  
  defSystem('instructions', `
Your goal is to systematically work through the task list to investigate each API method.

For each task:
1. Use startTask to mark a task as in progress
2. Complete the investigation according to the task
3. Use completeTask to mark the task as done

Work through tasks one at a time.
  `);
  
  $`Please list all the tasks and start working on the first one.`;
};

export const config = {
  model: 'mock'
};

export const mock = [
  { type: 'text', text: 'I can see the following investigation tasks:\n\n' },
  { type: 'text', text: '1. Investigate `def`\n' },
  { type: 'text', text: '2. Investigate `defAgent`\n' },
  { type: 'text', text: '3. Investigate `defData`\n' },
  { type: 'text', text: '4. Investigate plugin `defEffect`\n' },
  { type: 'text', text: '5. Investigate plugin `defFunction`\n' },
  { type: 'text', text: '6. Investigate plugin `defFunctionAgent`\n' },
  { type: 'text', text: '7. Investigate `defMessage`\n' },
  { type: 'text', text: '8. Investigate `defState`\n' },
  { type: 'text', text: '9. Investigate `defSystem`\n' },
  { type: 'text', text: '10. Investigate plugin `defTaskGraph`\n' },
  { type: 'text', text: '11. Investigate plugin `defTaskList`\n' },
  { type: 'text', text: '12. Investigate `defTool`\n\n' },
  { type: 'text', text: "Let me start with the first task.\n" },
  { type: 'tool-call', toolCallId: 'call_1', toolName: 'startTask', args: { taskId: '1' } },
  { type: 'text', text: '\n\nI have started investigating the `def` API. This involves analyzing how scalar variables are registered and rendered in system prompts.' },
];
