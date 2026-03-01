import ts from 'typescript';
import type { MethodRegistry } from './MethodRegistry';
import { generateTypeDeclarations } from './typeGenerator';

/**
 * A single TypeScript diagnostic reported for a user code line.
 */
export interface TypeCheckError {
  /** 1-based line number within the user code */
  line: number;
  /** 1-based column */
  column: number;
  /** Human-readable error message */
  message: string;
  /** TypeScript error code (e.g. 2345) */
  code: number;
  /** The source line that triggered the error */
  codeLine: string;
}

/**
 * Result of a TypeScript type-check pass.
 */
export interface TypeCheckResult {
  valid: boolean;
  errors: TypeCheckError[];
}

/**
 * Validates `code` against the TypeScript types generated from the registry.
 * Returns a `TypeCheckResult` with any diagnostics found.
 *
 * Works identically to the function plugin's `validateTypeScript`, but uses
 * `generateTypeDeclarations` from the zero-step type generator.
 */
export function validateTypeScript(code: string, registry: MethodRegistry): TypeCheckResult {
  const typeDeclarations = generateTypeDeclarations(registry);

  // Count lines in generated declarations (used to offset diagnostic line numbers back to user code)
  const declarationLineCount = typeDeclarations.split('\n').length;

  // Wrap user code in an async IIFE
  const wrappedCode = `(async () => {\n${code}\n})();`;

  const virtualFileName = 'virtual.ts';
  const virtualSource = `${typeDeclarations}\n\n${wrappedCode}`;

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

  const compilerHost = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = compilerHost.getSourceFile;

  compilerHost.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (fileName === virtualFileName) {
      return ts.createSourceFile(fileName, virtualSource, languageVersion, true);
    }
    return originalGetSourceFile.call(compilerHost, fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  const program = ts.createProgram([virtualFileName], compilerOptions, compilerHost);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  const errors: TypeCheckError[] = [];
  const codeLines = code.split('\n');

  for (const diagnostic of diagnostics) {
    if (diagnostic.file && diagnostic.start !== undefined) {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

      // Adjust for prepended declarations + blank line + async IIFE opening line
      const adjustedLine = line - declarationLineCount - 2;

      if (adjustedLine >= 0) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        const codeLine = codeLines[adjustedLine] || '';
        errors.push({
          line: adjustedLine + 1,
          column: character + 1,
          message,
          code: diagnostic.code,
          codeLine: codeLine.trim(),
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
