import ts from 'typescript';
import { zodToTs, createAuxiliaryTypeStore } from 'zod-to-ts';
import type { MethodDefinition } from './types';
import type { MethodRegistry } from './MethodRegistry';

/**
 * Detects if a function is async by checking its constructor name.
 */
function isAsyncHandler(fn: Function): boolean {
  return fn.constructor.name === 'AsyncFunction';
}

/**
 * Generates a single `declare function` declaration for a method definition.
 */
function generateMethodDeclaration(definition: MethodDefinition): string {
  const { name, parameterSchema, responseSchema, handler } = definition;

  const auxiliaryTypeStore = createAuxiliaryTypeStore();

  const inputTypeNode = zodToTs(parameterSchema, {
    auxiliaryTypeStore,
    unrepresentable: 'any',
    io: 'output',
  }).node;

  const outputTypeNode = zodToTs(responseSchema, {
    auxiliaryTypeStore,
    unrepresentable: 'any',
    io: 'output',
  }).node;

  const printer = ts.createPrinter();
  const sourceFile = ts.createSourceFile('temp.ts', '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

  const inputType = printer.printNode(ts.EmitHint.Unspecified, inputTypeNode, sourceFile);
  const outputType = printer.printNode(ts.EmitHint.Unspecified, outputTypeNode, sourceFile);

  const returnType = isAsyncHandler(handler) ? `Promise<${outputType}>` : outputType;

  return `declare function ${name}(args: ${inputType}): ${returnType};`;
}

/**
 * Generates a single TypeScript `declare function` signature string for one method.
 * Exported so the system prompt builder can embed the signature per method.
 */
export function generateMethodSignature(definition: MethodDefinition): string {
  return generateMethodDeclaration(definition);
}

/**
 * Generates TypeScript `declare function` statements for all methods in the registry.
 * These are used as a preamble when type-checking code inside `<run_code>` blocks.
 */
export function generateTypeDeclarations(registry: MethodRegistry): string {
  const declarations: string[] = [];

  for (const [, definition] of registry.getAll()) {
    declarations.push(generateMethodDeclaration(definition));
  }

  return declarations.join('\n\n');
}
