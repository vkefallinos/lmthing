import ts from 'typescript';
import { zodToTs, createAuxiliaryTypeStore } from 'zod-to-ts';
import type { FunctionDefinition } from './types';
import type { FunctionRegistry } from './FunctionRegistry';

/**
 * Detects if a function is async by checking its constructor name
 */
function isAsyncFunction(fn: Function): boolean {
  return fn.constructor.name === 'AsyncFunction';
}

/**
 * Generates TypeScript type declaration for a single function
 */
function generateFunctionDeclaration(definition: FunctionDefinition): string {
  const { name, inputSchema, responseSchema, execute } = definition;

  // Create auxiliary type store for zod-to-ts
  const auxiliaryTypeStore = createAuxiliaryTypeStore();

  // Convert Zod schemas to TypeScript types
  const inputTypeNode = zodToTs(inputSchema, {
    auxiliaryTypeStore,
    unrepresentable: 'any',
    io: 'output'
  }).node;
  const outputTypeNode = zodToTs(responseSchema, {
    auxiliaryTypeStore,
    unrepresentable: 'any',
    io: 'output'
  }).node;

  // Create printer for converting type nodes to strings
  const printer = ts.createPrinter();
  const sourceFile = ts.createSourceFile('temp.ts', '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

  const inputType = printer.printNode(ts.EmitHint.Unspecified, inputTypeNode, sourceFile);
  const outputType = printer.printNode(ts.EmitHint.Unspecified, outputTypeNode, sourceFile);

  // Wrap return type in Promise if function is async
  const isAsync = isAsyncFunction(execute);
  const returnType = isAsync ? `Promise<${outputType}>` : outputType;

  // Generate function declaration
  const functionName = name.includes('.') ? name.split('.').pop() : name;
  return `declare function ${functionName}(args: ${inputType}): ${returnType};`;
}

/**
 * Generates TypeScript namespace declaration for composite functions
 */
function generateNamespaceDeclaration(
  namespace: string,
  definitions: Record<string, FunctionDefinition>
): string {
  const declarations: string[] = [];

  // Create auxiliary type store for zod-to-ts
  const auxiliaryTypeStore = createAuxiliaryTypeStore();

  for (const definition of Object.values(definitions)) {
    const { inputSchema, responseSchema, execute } = definition;

    // Convert Zod schemas to TypeScript types
    const inputTypeNode = zodToTs(inputSchema, {
      auxiliaryTypeStore,
      unrepresentable: 'any',
      io: 'output'
    }).node;
    const outputTypeNode = zodToTs(responseSchema, {
      auxiliaryTypeStore,
      unrepresentable: 'any',
      io: 'output'
    }).node;

    // Create printer for converting type nodes to strings
    const printer = ts.createPrinter();
    const sourceFile = ts.createSourceFile('temp.ts', '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

    const inputType = printer.printNode(ts.EmitHint.Unspecified, inputTypeNode, sourceFile);
    const outputType = printer.printNode(ts.EmitHint.Unspecified, outputTypeNode, sourceFile);

    // Wrap return type in Promise if function is async
    const isAsync = isAsyncFunction(execute);
    const returnType = isAsync ? `Promise<${outputType}>` : outputType;

    // Get sub-function name
    const funcName = definition.name.split('.').pop()!;
    declarations.push(`  function ${funcName}(args: ${inputType}): ${returnType};`);
  }

  return `declare namespace ${namespace} {\n${declarations.join('\n')}\n}`;
}

/**
 * Generates TypeScript type declarations for all registered functions
 */
export function generateTypeDeclarations(registry: FunctionRegistry): string {
  const declarations: string[] = [];

  for (const [name, value] of registry.getAll().entries()) {
    if ('execute' in value) {
      // Single function
      declarations.push(generateFunctionDeclaration(value as FunctionDefinition));
    } else {
      // Composite function (namespace)
      declarations.push(generateNamespaceDeclaration(name, value as Record<string, FunctionDefinition>));
    }
  }

  return declarations.join('\n\n');
}
