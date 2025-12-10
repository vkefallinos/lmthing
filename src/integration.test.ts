import { describe, it, expect, vi } from 'vitest';
import { Prompt, tool, agent } from './Prompt';
import { createMockModel } from './test/createMockModel';
import { z } from 'zod';
import { runPrompt } from './runPrompt';

describe('Prompt', () => {
  it('should handle a complete workflow testing all Prompt class features', async () => {
    // Create a mock model that simulates a multi-step conversation with tool calls
    const mockModel = createMockModel([
      // Step 0: Initial planning and research
      { type: 'text', text: "I'll begin by researching " },
      { type: 'text', text: 'Quantum Computing Applications. ' },
      { type: 'text', text: 'Let me start with a comprehensive search.\n\n' },
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'research',
        args: {
          query: 'Quantum Computing Applications overview',
          depth: 'deep'
        }
      },

      // Step 1: More research and file operations
      { type: 'text', text: 'Great! Now let me research specific applications ' },
      { type: 'text', text: 'and save the findings.\n\n' },
      {
        type: 'tool-call',
        toolCallId: 'call_2',
        toolName: 'research',
        args: {
          query: 'Quantum Computing in cryptography',
          depth: 'medium'
        }
      },
      {
        type: 'tool-call',
        toolCallId: 'call_3',
        toolName: 'file',
        args: {
          calls: [
            {
              name: 'write',
              args: {
                path: '/tmp/research.txt',
                content: 'Quantum Computing Research Findings\n\nKey applications in cryptography...'
              }
            }
          ]
        }
      },

      // Step 2: Specialized analysis with agents
      { type: 'text', text: 'Now I need deep analysis from specialists.\n\n' },
      {
        type: 'tool-call',
        toolCallId: 'call_4',
        toolName: 'specialists',
        args: {
          calls: [
            {
              name: 'technical_analyst',
              args: {
                topic: 'Quantum Computing',
                focus: 'algorithm complexity'
              }
            },
            {
              name: 'market_analyst',
              args: {
                topic: 'Quantum Computing',
                market: 'enterprise'
              }
            }
          ]
        }
      },

      // Step 3: Calculate metrics and synthesize
      { type: 'text', text: 'Let me calculate some metrics ' },
      { type: 'text', text: 'and synthesize the findings.\n\n' },
      {
        type: 'tool-call',
        toolCallId: 'call_5',
        toolName: 'calculator',
        args: {
          operation: 'analyze',
          values: [85, 92, 78, 88, 95]
        }
      },
      {
        type: 'tool-call',
        toolCallId: 'call_6',
        toolName: 'synthesizer',
        args: {
          findings: [
            'Quantum computing shows promise in cryptography',
            'Technical feasibility is high with current algorithms',
            'Market adoption expected to grow in enterprise sector',
            'Average confidence score: 87.6%'
          ],
          format: 'executive'
        }
      },

      // Final response
      { type: 'text', text: '\n\n**Research Complete!**\n\n' },
      { type: 'text', text: 'I have conducted a comprehensive analysis of Quantum Computing Applications through multiple phases:\n\n' },
      { type: 'text', text: '1. ✅ Initial research gathered key findings\n' },
      { type: 'text', text: '2. ✅ Specialized agents provided deep technical and market analysis\n' },
      { type: 'text', text: '3. ✅ Metrics calculated and findings synthesized\n' },
      { type: 'text', text: '4. ✅ Executive report generated\n\n' },
      { type: 'text', text: 'The workflow progressed through all phases successfully!' }
    ]);

    // Mock tool implementations
    const { result, prompt } = await runPrompt(
      async ({ defState, defEffect, defSystem, def, defData, defTool, defAgent, defHook, $ }) => {

        // ========== STATE MANAGEMENT ==========
        const [phase, setPhase] = defState('phase', 'initialization');
        const [researchCount, setResearchCount] = defState('researchCount', 0);
        const [findings, setFindings] = defState('findings', []);
        const [analysisComplete, setAnalysisComplete] = defState('analysisComplete', false);
        
        // ========== EFFECTS ==========
        // Effect 1: Log phase changes
        defEffect((context, stepModifier) => {
          console.log(`[Effect] Phase: ${phase}`);
          // Add phase information to system prompt
          if(phase==='initialization') {
            stepModifier('systems', context.systems.filter(s => s.name !== 'role'));
          }
        }, [phase]);

        // Effect 2: Track research progress
        defEffect((context) => {
          if (researchCount > 0) {
            console.log(`[Effect] Research count: ${researchCount}, Findings: ${findings.length}`);
            console.log({
              systems: context.systems.map(s=>s.name),
              variables: context.variables,
              tools: context.tools.map(t=>t.name),
            })
          }
        }, [researchCount, findings]);

        // Effect 3: Limit messages on later steps
        defEffect((context, stepModifier) => {
          if (context.stepNumber > 2) {
            // Keep only last 10 messages for efficiency
            stepModifier('messages', context.messages.slice(-2));
          }
        }, []);

        // ========== SYSTEM PARTS ==========
        defSystem('role', `role prompt`);

        defSystem('guidelines', `guidelines prompt`);

        defSystem('expertise', `expertise prompt`);

        // ========== VARIABLES ==========
        const topic = def('RESEARCH_TOPIC', 'Quantum Computing Applications');
        const maxDepth = def('MAX_RESEARCH_DEPTH', '3');

        defData('CONFIG', {
          timeout: 30000,
          maxRetries: 3,
          analysisMode: 'comprehensive',
          priorities: ['accuracy', 'depth', 'novelty']
        });

        defData('WORKFLOW_PHASES', {
          initialization: 'Set up research parameters',
          research: 'Gather information from multiple sources',
          analysis: 'Deep analysis by specialist agents',
          synthesis: 'Combine findings into final report',
          completion: 'Finalize and save results'
        });

        // ========== COMPOSITE TOOLS ==========
        defTool('file', 'File operations for saving research data', [
          tool(
            'write',
            'Write content to a file',
            z.object({ path: z.string(), content: z.string() }),
            async (args) => {
              console.log(`[Tool] Writing to ${args.path}`);
              setResearchCount(prev => prev + 1);
              return { success: true, bytesWritten: args.content.length };
            }
          ),
          tool(
            'append',
            'Append content to a file',
            z.object({ path: z.string(), content: z.string() }),
            async (args) => {
              console.log(`[Tool] Appending to ${args.path}`);
              return { success: true, bytesWritten: args.content.length };
            }
          ),
          tool(
            'read',
            'Read a file',
            z.object({ path: z.string() }),
            async (args) => {
              console.log(`[Tool] Reading ${args.path}`);
              return { content: 'Previous research findings...' };
            }
          )
        ]);

        // ========== SINGLE TOOLS ==========
        defTool(
          'research',
          'Search for information on a topic',
          z.object({
            query: z.string(),
            depth: z.enum(['shallow', 'medium', 'deep']).default('medium')
          }),
          async (args) => {
            console.log(`[Tool] Researching: ${args.query} (${args.depth})`);

            // Update state
            setResearchCount(prev => prev + 1);
            setFindings(prev => [...prev, {
              query: args.query,
              timestamp: Date.now(),
              results: `Findings for ${args.query}`
            }]);
            console.log('Phase before tool call:', phase);
            // Advance phase if needed
            if (phase === 'initialization') {
              console.log('[Tool] Advancing phase to research');
              setPhase('research');
            }

            return {
              results: [
                `Key finding 1 about ${args.query}`
              ],
              confidence: 0.85,
              sources: 3
            };
          }
        );

        defTool(
          'calculator',
          'Perform mathematical calculations',
          z.object({
            operation: z.enum(['add', 'multiply', 'analyze']),
            values: z.array(z.number())
          }),
          async (args) => {
            console.log(`[Tool] Calculating: ${args.operation} on ${args.values}`);

            let result;
            if (args.operation === 'add') {
              result = args.values.reduce((a, b) => a + b, 0);
            } else if (args.operation === 'multiply') {
              result = args.values.reduce((a, b) => a * b, 1);
            } else {
              result = args.values.reduce((a, b) => a + b, 0) / args.values.length;
            }

            return { result, operation: args.operation };
          }
        );

        // ========== COMPOSITE AGENTS ==========
        defAgent('specialists', 'Specialized analysis agents for deep research', [
          agent(
            'technical_analyst',
            'Analyze technical aspects and feasibility',
            z.object({ topic: z.string(), focus: z.string() }),
            async (args, childPrompt) => {
              console.log(`[Agent] Technical analyst analyzing: ${args.topic}`);

              childPrompt.defSystem('role', 'You are a technical analyst specializing in deep technical evaluation.');
              childPrompt.def('ANALYSIS_FOCUS', args.focus);
              childPrompt.$`Analyze the technical aspects of ${args.topic} with focus on ${args.focus}`;

              // Update parent state
              setPhase('analysis');
            },
            { model: 'mock' }
          ),
          agent(
            'market_analyst',
            'Analyze market trends and commercial viability',
            z.object({ topic: z.string(), market: z.string() }),
            async (args, childPrompt) => {
              console.log(`[Agent] Market analyst analyzing: ${args.topic}`);

              childPrompt.defSystem('role', 'You are a market analyst specializing in commercial trends.');
              childPrompt.def('MARKET_FOCUS', args.market);
              childPrompt.$`Analyze the market potential of ${args.topic} in the ${args.market} market`;
            },
            { model: 'mock' }
          )
        ]);

        // ========== SINGLE AGENT ==========
        defAgent(
          'synthesizer',
          'Synthesize all research findings into a coherent report',
          z.object({
            findings: z.array(z.string()),
            format: z.enum(['summary', 'detailed', 'executive'])
          }),
          async (args, childPrompt) => {
            console.log(`[Agent] Synthesizer creating ${args.format} report`);

            childPrompt.defSystem('role', 'You are a research synthesizer who creates comprehensive reports.');
            childPrompt.defData('FINDINGS', args.findings);
            childPrompt.$`Create a ${args.format} report synthesizing these findings`;

            // Mark analysis as complete
            setAnalysisComplete(true);
            setPhase('synthesis');
          },
          { model: 'mock' }
        );

        // ========== HOOKS ==========
   
        // ========== MESSAGES ==========
        $`You are starting a comprehensive research project on ${topic}.Maximum research depth is ${maxDepth}.`;
      }, {
      model: mockModel
    })
    await result.text; // Consume the stream
    expect(prompt.steps).toMatchSnapshot();
  });
});