import {
  parseSync,
  transformSync,
  traverse,
  type NodePath,
  type PluginItem,
} from '@babel/core';
import { babelOptimizerPlugin } from '@graphql-codegen/client-preset';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

/*
 * The React Compiler memoizes every component and hook it compiles, so a
 * change re-renders only what reads it (vite.config.ts). One it can't
 * compile, or doesn't take for a component, it leaves as written, silently:
 * these say which, and why, on the same plugins the build runs.
 */

const SRC = new URL('.', import.meta.url).pathname;
const sources = (readdirSync(SRC, { recursive: true }) as string[]).filter(
  (file) =>
    /\.tsx?$/.test(file) &&
    !/\.test\.tsx?$|__generated__|^sacred\//.test(file.replaceAll('\\', '/'))
);
const syntax = (file: string): PluginItem => [
  '@babel/plugin-syntax-typescript',
  { isTSX: file.endsWith('.tsx') },
];
const parse = (file: string) =>
  parseSync(readFileSync(join(SRC, file), 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    plugins: [syntax(file)],
  });

interface CompilerEvent {
  kind: string;
  fnLoc?: { start: { line: number } } | null;
  detail?: { reason?: string; options?: { reason?: string } };
}

/** A component (`ChatWindow`) or hook (`useClock`), by its name. */
const isComponentOrHookName = (name: string | null | undefined) =>
  !!name && /^(use[A-Z0-9]|[A-Z])/.test(name);

/** The name a function is given: its own, or the variable's it's assigned to. */
function nameOf(path: NodePath): string | null {
  if (!path.isFunction()) return null;
  const node = path.node;
  if ('id' in node && node.id) return node.id.name;
  const parent = path.parentPath?.node;
  return parent?.type === 'VariableDeclarator' &&
    parent.id.type === 'Identifier'
    ? parent.id.name
    : null;
}
const isComponentOrHook = (path: NodePath) =>
  isComponentOrHookName(nameOf(path));

it('compiles every component and hook', () => {
  const failures: string[] = [];
  let compiled = 0;
  for (const file of sources) {
    const events: CompilerEvent[] = [];
    transformSync(readFileSync(join(SRC, file), 'utf8'), {
      filename: file,
      babelrc: false,
      configFile: false,
      // As vite.config.ts runs them.
      plugins: [
        syntax(file),
        [
          babelOptimizerPlugin,
          { artifactDirectory: `${SRC}lib/__generated__`, gqlTagName: 'gql' },
        ],
        [
          'babel-plugin-react-compiler',
          {
            logger: {
              logEvent: (_: string, event: CompilerEvent) => events.push(event),
            },
          },
        ],
      ],
    });
    for (const event of events) {
      if (event.kind === 'CompileSuccess') compiled += 1;
      if (event.kind === 'CompileError') {
        const detail = event.detail?.options ?? event.detail;
        failures.push(`${file}:${event.fnLoc?.start.line}: ${detail?.reason}`);
      }
    }

    // A component or hook at the top of a module (exported, or in memo())
    // that the compiler said nothing about was skipped: it took it for
    // neither, such as one returning a string or an array, not elements.
    const heard = new Set(events.map((event) => event.fnLoc?.start.line));
    const ast = parse(file);
    if (!ast) continue;
    traverse(ast, {
      Function(path) {
        if (!isComponentOrHook(path)) return;
        const atTop = path.findParent(
          (parent) => parent.isFunction() || parent.isProgram()
        );
        if (!atTop?.isProgram()) return;
        const line = path.node.loc?.start.line;
        if (!heard.has(line)) {
          failures.push(`${file}:${line}: ${nameOf(path)} was skipped`);
        }
      },
    });
  }
  expect(failures).toEqual([]);
  // Every function component and hook in the app, give or take a few.
  expect(compiled).toBeGreaterThan(80);
  // Compiling the whole app takes a few seconds, more beside other suites.
}, 60_000);

it("never reads or reassigns a module's `let` inside a component or hook", () => {
  // The compiler takes such a variable for constant there: it once read one
  // after a call that reassigned it. Only plain functions outside touch them.
  const found: string[] = [];
  for (const file of sources) {
    const ast = parse(file);
    if (!ast) continue;
    traverse(ast, {
      Program(program) {
        for (const binding of Object.values(program.scope.bindings)) {
          // A class is a `let` too, to Babel: only variables can change.
          if (binding.kind !== 'let' || !binding.path.isVariableDeclarator()) {
            continue;
          }
          for (const path of [
            ...binding.referencePaths,
            ...binding.constantViolations,
          ]) {
            if (path.findParent(isComponentOrHook)) {
              found.push(
                `${file}:${path.node.loc?.start.line}: ${binding.identifier.name}`
              );
            }
          }
        }
      },
    });
  }
  expect(found).toEqual([]);
});
