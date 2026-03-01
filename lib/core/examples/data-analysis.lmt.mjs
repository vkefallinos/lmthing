/**
 * Data analysis example
 *
 * Run with: npx lmthing run examples/data-analysis.lmt.mjs
 *
 * Demonstrates defData for structured data and defEffect for step modifications
 */

export default async ({ defSystem, def, defData, defEffect, $ }) => {
  defSystem('role', 'You are a data analyst assistant.');
  defSystem('guidelines', 'Always provide insights with supporting numbers.');

  // Define structured data that will be YAML-formatted in the prompt
  const salesData = defData('SALES_DATA', {
    q1: { revenue: 150000, units: 1200, growth: 0.15 },
    q2: { revenue: 180000, units: 1450, growth: 0.20 },
    q3: { revenue: 165000, units: 1300, growth: -0.08 },
    q4: { revenue: 210000, units: 1700, growth: 0.27 }
  });

  const companyName = def('COMPANY', 'Acme Corp');

  // Add an effect to track step execution on every step
  defEffect(({ stepNumber }) => {
    console.error(`[Step ${stepNumber}] Processing...`);
  });

  $`Analyze the quarterly sales data for ${companyName} (${salesData}).
    Identify trends and provide recommendations for next year.`;
};

export const config = {
  model: 'openai:gpt-4o-mini'
};
