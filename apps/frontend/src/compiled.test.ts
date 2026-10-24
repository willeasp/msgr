import { parseSync, transformSync, traverse, type NodePath } from '@babel/core';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

/*
 * The React Compiler memoizes every component and hook it can compile, so a
 * change re-renders only what reads it (vite.config.ts). One it can't compile
 * it leaves as written, silently: this says which, and why.
 */

const SRC = new URL('.', import.meta.url).pathname;
const sources = (readdirSync(SRC, { recursive: true }) as string[]).filter(
  (file) =>
    /\.tsx?$/.test(file) &&
    !/\.test\.tsx?$|__generated__|^sacred\//.test(file.replaceAll('\\', '/'))
);

it('compiles every component and hook', () => {
  const failures: string[] = [];
  let compiled = 0;
  for (const file of sources) {
    transformSync(readFileSync(join(SRC, file), 'utf8'), {
      filename: file,
      babelrc: false,
      configFile: false,
      plugins: [
        ['@babel/plugin-syntax-typescript', { isTSX: file.endsWith('.tsx') }],
        [
          'babel-plugin-react-compiler',
          {
            logger: {
              logEvent(_: string, event: CompilerEvent) {
                if (event.kind === 'CompileSuccess') compiled += 1;
                if (event.kind === 'CompileError') {
                  const detail = event.detail?.options ?? event.detail;
                  failures.push(
                    `${file}:${event.fnLoc?.start.line}: ${detail?.reason}`
                  );
                }
              },
            },
          },
        ],
      ],
    });
  }
  expect(failures).toEqual([]);
  // Every function component and hook in the app, give or take a few.
  expect(compiled).toBeGreaterThan(80);
  // Compiling the whole app takes a few seconds, more beside other suites.
}, 60_000);

interface CompilerEvent {
  kind: string;
  fnLoc?: { start: { line: number } } | null;
  detail?: { reason?: string; options?: { reason?: string } };
}

/** A component (`ChatWindow`) or hook (`useClock`), by the name it's given. */
function isComponentOrHook(path: NodePath): boolean {
  if (!path.isFunction()) return false;
  const node = path.node;
  const own = 'id' in node && node.id ? node.id.name : null;
  const parent = path.parentPath?.node;
  const name =
    own ??
    (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier'
      ? parent.id.name
      : null);
  return name !== null && /^(use[A-Z0-9]|[A-Z])/.test(name);
}

it("never reassigns a module's variable inside a component or hook", () => {
  // The compiler takes such a variable as constant there, and may read it
  // after it was reassigned: keep that code in a plain function outside.
  const found: string[] = [];
  for (const file of sources) {
    const ast = parseSync(readFileSync(join(SRC, file), 'utf8'), {
      filename: file,
      babelrc: false,
      configFile: false,
      plugins: [
        ['@babel/plugin-syntax-typescript', { isTSX: file.endsWith('.tsx') }],
      ],
    });
    if (!ast) continue;
    const reassigned = (path: NodePath, name: string | null) => {
      const binding = name ? path.scope.getBinding(name) : undefined;
      if (binding?.kind !== 'let' || !binding.scope.path.isProgram()) return;
      if (path.findParent(isComponentOrHook)) {
        found.push(`${file}:${path.node.loc?.start.line}: ${name}`);
      }
    };
    traverse(ast, {
      AssignmentExpression: (path) =>
        reassigned(
          path,
          path.node.left.type === 'Identifier' ? path.node.left.name : null
        ),
      UpdateExpression: (path) =>
        reassigned(
          path,
          path.node.argument.type === 'Identifier'
            ? path.node.argument.name
            : null
        ),
    });
  }
  expect(found).toEqual([]);
});
