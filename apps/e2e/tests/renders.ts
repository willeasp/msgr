import type { Page } from '@playwright/test';

/*
 * Counts what React renders in the production build, the way React DevTools
 * does: through the hook React calls on every commit
 * (`__REACT_DEVTOOLS_GLOBAL_HOOK__`). A component counts as rendered when its
 * function ran in that commit. Names are minified in production, so each is
 * labelled by the CSS module class of the first element it draws
 * ("MessageBubble__own"), which the build keeps readable (vite.config.ts).
 */

/** What rendered while an action ran: per label, and in total. */
export interface Renders {
  readonly total: number;
  /** Rendered components whose elements lie inside the container asked about. */
  readonly inside: number;
  readonly byLabel: Readonly<Record<string, number>>;
  /** The same, of those inside the container. */
  readonly insideByLabel: Readonly<Record<string, number>>;
  readonly commits: number;
}

declare global {
  interface Window {
    __renders?: {
      container: string | null;
      total: number;
      inside: number;
      byLabel: Record<string, number>;
      insideByLabel: Record<string, number>;
      commits: number;
    };
  }
}

/** Installs the counter; call before the page loads. */
export async function countRenders(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // React's fiber tags and the flag set when a component's function runs.
    const COMPONENTS = new Set([0, 1, 11, 14, 15]);
    const HOST = 5;
    const PERFORMED_WORK = 1;
    type Fiber = {
      tag: number;
      flags: number;
      child: Fiber | null;
      sibling: Fiber | null;
      return: Fiber | null;
      alternate: Fiber | null;
      stateNode: unknown;
    };
    const state = {
      container: null as string | null,
      total: 0,
      inside: 0,
      byLabel: {} as Record<string, number>,
      insideByLabel: {} as Record<string, number>,
      commits: 0,
    };
    window.__renders = state;

    const firstElement = (fiber: Fiber): Element | null => {
      for (let at: Fiber | null = fiber.child; at; ) {
        if (at.tag === HOST && at.stateNode instanceof Element) {
          return at.stateNode;
        }
        at = at.child ?? at.sibling ?? null;
      }
      return null;
    };
    const hostAbove = (fiber: Fiber): Element | null => {
      for (let at = fiber.return; at; at = at.return) {
        if (at.tag === HOST && at.stateNode instanceof Element) {
          return at.stateNode;
        }
      }
      return null;
    };
    const labelOf = (fiber: Fiber) => {
      const element = firstElement(fiber);
      const name =
        element && typeof element.className === 'string'
          ? element.className.split(/\s+/).find((c) => c.includes('__'))
          : undefined;
      return name ?? element?.tagName.toLowerCase() ?? 'nothing';
    };
    const counted = (fiber: Fiber) => {
      state.total += 1;
      const label = labelOf(fiber);
      state.byLabel[label] = (state.byLabel[label] ?? 0) + 1;
      const container = state.container
        ? document.querySelector(state.container)
        : null;
      const at = firstElement(fiber) ?? hostAbove(fiber);
      if (container && at && container.contains(at)) {
        state.inside += 1;
        state.insideByLabel[label] = (state.insideByLabel[label] ?? 0) + 1;
      }
    };
    // A subtree React skipped keeps its old children: nothing in it ran.
    const walk = (fiber: Fiber | null) => {
      for (let at = fiber; at; at = at.sibling) {
        const mounted = at.alternate === null;
        if (COMPONENTS.has(at.tag) && (mounted || at.flags & PERFORMED_WORK)) {
          counted(at);
        }
        if (mounted || at.child !== at.alternate?.child) walk(at.child);
      }
    };

    Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
      value: {
        supportsFiber: true,
        isDisabled: false,
        renderers: new Map(),
        inject: () => 1,
        checkDCE: () => undefined,
        onScheduleFiberRoot: () => undefined,
        onCommitFiberUnmount: () => undefined,
        onPostCommitFiberRoot: () => undefined,
        onCommitFiberRoot: (_id: number, root: { current: Fiber }) => {
          state.commits += 1;
          walk(root.current.child);
        },
      },
    });
  });
}

/**
 * What rendered while `action` ran and for `settle` ms after, counting as
 * inside what lies in `container`.
 */
export async function rendersDuring(
  page: Page,
  container: string,
  action: () => Promise<unknown>,
  settle = 300
): Promise<Renders> {
  await page.evaluate((selector) => {
    const state = window.__renders;
    if (!state) throw new Error('countRenders was not installed');
    Object.assign(state, {
      container: selector,
      total: 0,
      inside: 0,
      byLabel: {},
      insideByLabel: {},
      commits: 0,
    });
  }, container);
  await action();
  await page.waitForTimeout(settle);
  return page.evaluate(() => {
    const state = window.__renders;
    if (!state) throw new Error('countRenders was not installed');
    return {
      total: state.total,
      inside: state.inside,
      byLabel: { ...state.byLabel },
      insideByLabel: { ...state.insideByLabel },
      commits: state.commits,
    };
  });
}
