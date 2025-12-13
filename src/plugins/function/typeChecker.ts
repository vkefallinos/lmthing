import ts from 'typescript';
import type { ValidationResult, TypeScriptError } from './types';
import type { FunctionRegistry } from './FunctionRegistry';
import { generateTypeDeclarations } from './typeGenerator';

/**
 * Validates user code using TypeScript compiler
 */
export function validateTypeScript(code: string, registry: FunctionRegistry): ValidationResult {
  // Generate type declarations for all registered functions
  const typeDeclarations = generateTypeDeclarations(registry);

  // Count lines in type declarations to adjust error line numbers
  const declarationLineCount = typeDeclarations.split('\n').length;

  // Wrap user code in an async IIFE
  const wrappedCode = `(async () => {\n${code}\n})();`;

  // Create virtual TypeScript source file
  const virtualFileName = 'virtual.ts';
  const virtualSource = `${typeDeclarations}\n\n${wrappedCode}`;

  // Configure TypeScript compiler options
  const compilerOptions: ts.CompilerOptions = {
    strict: true,
    noImplicitAny: true,
    strictNullChecks: true,
    strictFunctionTypes: true,
    strictPropertyInitialization: true,
    strictBindCallApply: true,
    noImplicitThis: true,
    alwaysStrict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    lib: ['lib.es2022.d.ts'],
    skipLibCheck: true,
  };

  // Create custom compiler host
  const compilerHost = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = compilerHost.getSourceFile;

  compilerHost.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (fileName === virtualFileName) {
      return ts.createSourceFile(fileName, virtualSource, languageVersion, true);
    }
    return originalGetSourceFile.call(compilerHost, fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  // Create TypeScript program
  const program = ts.createProgram([virtualFileName], compilerOptions, compilerHost);

  // Get diagnostics (errors and warnings)
  const diagnostics = ts.getPreEmitDiagnostics(program);

  // Convert diagnostics to error format
  const errors: TypeScriptError[] = [];

  for (const diagnostic of diagnostics) {
    if (diagnostic.file && diagnostic.start !== undefined) {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

      // Adjust line number to account for prepended type declarations and wrapper
      // We need to subtract the declaration lines + blank line + async IIFE opening line
      const adjustedLine = line - declarationLineCount - 2;

      // Only include errors from user code (not from type declarations)
      if (adjustedLine >= 0) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        errors.push({
          line: adjustedLine + 1, // Convert to 1-based
          column: character + 1,   // Convert to 1-based
          message,
          code: diagnostic.code,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
