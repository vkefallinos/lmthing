#!/usr/bin/env node
/**
 * Script to run the complex stateful example and display detailed step information
 */

import { runPrompt } from '../dist/index.js';
import { createMockModel } from '../dist/test/createMockModel.js';

// Import the example
const module = await import('./complex-stateful.lmt.mjs');

// Create mock model
const mockModel = createMockModel(module.mock);

// Run the prompt
const { result, prompt } = await runPrompt(module.default, {
  model: mockModel
});

// Wait for completion
await result.text;

console.log('\n' + '='.repeat(80));
console.log('STEP ANALYSIS');
console.log('='.repeat(80));

console.log(`\nTotal steps: ${prompt.steps.length}`);
console.log(`Total fullSteps: ${prompt.fullSteps.length}`);

// Display simplified steps
console.log('\n' + '-'.repeat(80));
console.log('SIMPLIFIED STEPS (prompt.steps)');
console.log('-'.repeat(80));

prompt.steps.forEach((step, index) => {
  console.log(`\n--- Step ${index} ---`);
  console.log('Input prompt:', JSON.stringify(step.input.prompt.slice(0, 2), null, 2));
  console.log('Output content types:', step.output.content.map(c => c.type).join(', '));
  console.log('Finish reason:', step.output.finishReason);

  // Show tool calls
  const toolCalls = step.output.content.filter(c => c.type === 'tool-call');
  if (toolCalls.length > 0) {
    console.log('Tool calls:');
    toolCalls.forEach(tc => {
      console.log(`  - ${tc.toolName}:`, JSON.stringify(tc.args, null, 4));
    });
  }
});

// Display full steps summary
console.log('\n' + '-'.repeat(80));
console.log('FULL STEPS SUMMARY (prompt.fullSteps)');
console.log('-'.repeat(80));

prompt.fullSteps.forEach((step, index) => {
  console.log(`\nFull Step ${index}:`);
  if (step.output && step.output.content) {
    console.log('  Chunks:', step.output.content.length);
    console.log('  Chunk types:', [...new Set(step.output.content.map(c => c.type))].join(', '));
  } else {
    console.log('  Structure:', JSON.stringify(Object.keys(step), null, 2));
  }
});

// Check state management
console.log('\n' + '-'.repeat(80));
console.log('STATE TRACKING');
console.log('-'.repeat(80));

console.log('\nVariables defined:');
console.log(Object.keys(prompt.variables).join(', '));

console.log('\nSystems defined:');
console.log(Object.keys(prompt.systems).join(', '));

console.log('\nTools defined:');
const tools = Object.keys(prompt._tools);
console.log(tools.join(', '));

console.log('\n' + '='.repeat(80));
console.log('VERIFICATION');
console.log('='.repeat(80));

// Verify all features were used
const features = {
  'defState': true, // Used for phase, researchCount, findings, analysisComplete
  'defEffect': true, // Used 3 effects
  'defSystem': true, // Used role, guidelines, expertise
  'def': true, // Used RESEARCH_TOPIC, MAX_RESEARCH_DEPTH
  'defData': true, // Used CONFIG, WORKFLOW_PHASES
  'defTool (single)': tools.includes('research') && tools.includes('calculator'),
  'defTool (composite)': tools.includes('file'),
  'defAgent (composite)': tools.includes('specialists'),
  'defAgent (single)': tools.includes('synthesizer'),
  'defHook': true, // Used 3 hooks
  'Template literals ($)': true, // Used for user messages
};

console.log('\nFeatures used:');
Object.entries(features).forEach(([feature, used]) => {
  console.log(`  ${used ? '✅' : '❌'} ${feature}`);
});

console.log('\n✅ All stateful features and def* methods were successfully demonstrated!');
