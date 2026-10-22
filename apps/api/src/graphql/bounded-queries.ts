import {
  GraphQLError,
  Kind,
  type ASTVisitor,
  type SelectionSetNode,
  type ValidationContext,
} from 'graphql';

/** Deeper than any query the app makes, with room to spare. */
export const MAX_DEPTH = 10;

/** How deep a selection goes, and whether it reads a history, or one inside another. */
interface Shape {
  readonly depth: number;
  readonly history: boolean;
  readonly nested: boolean;
}

const LEAF: Shape = { depth: 0, history: false, nested: false };

/**
 * A query asks for a bounded amount of work. `Message.chat` leads back to
 * `Chat.messages`, so without a limit one query could ask for a page of
 * messages for every message in a page, and so on, until the single instance
 * runs out of memory. So a query goes at most MAX_DEPTH fields deep, and never
 * reads a history (`messages`) inside another.
 */
export function boundedQueries(context: ValidationContext): ASTVisitor {
  // Each fragment is measured once, however often it's spread: a fragment
  // spreading another twice, nested, would otherwise take exponential time.
  const fragments = new Map<string, Shape>();
  const shapeOf = (set: SelectionSetNode): Shape => {
    let depth = 0;
    let history = false;
    let nested = false;
    for (const selection of set.selections) {
      let shape: Shape;
      if (selection.kind === Kind.FIELD) {
        const inner = selection.selectionSet
          ? shapeOf(selection.selectionSet)
          : LEAF;
        const isHistory = selection.name.value === 'messages';
        shape = {
          depth: inner.depth + 1,
          history: isHistory || inner.history,
          nested: inner.nested || (isHistory && inner.history),
        };
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        shape = shapeOf(selection.selectionSet);
      } else {
        const name = selection.name.value;
        if (!fragments.has(name)) {
          // A leaf while it's measured: a cycle, refused by another rule, adds nothing.
          fragments.set(name, LEAF);
          const fragment = context.getFragment(name);
          fragments.set(name, fragment ? shapeOf(fragment.selectionSet) : LEAF);
        }
        shape = fragments.get(name) ?? LEAF;
      }
      depth = Math.max(depth, shape.depth);
      history ||= shape.history;
      nested ||= shape.nested;
    }
    return { depth, history, nested };
  };

  return {
    OperationDefinition(operation) {
      const shape = shapeOf(operation.selectionSet);
      if (shape.depth > MAX_DEPTH) {
        context.reportError(
          new GraphQLError(`A query may go at most ${MAX_DEPTH} fields deep.`, {
            nodes: [operation],
          })
        );
      }
      if (shape.nested) {
        context.reportError(
          new GraphQLError('A query may not read messages inside messages.', {
            nodes: [operation],
          })
        );
      }
    },
  };
}
