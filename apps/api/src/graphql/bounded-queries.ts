import {
  GraphQLError,
  Kind,
  type ASTVisitor,
  type FieldNode,
  type SelectionSetNode,
  type ValidationContext,
} from 'graphql';

/** Deeper than any query the app makes, with room to spare. */
export const MAX_DEPTH = 10;
/** Fields one operation may select; the app's largest selects 37. */
export const MAX_FIELDS = 200;
/**
 * Selections of `bits` one operation may make: each is the whole of a
 * picture, movie or sound (deprecated). The app's most is 5.
 */
export const MAX_BITS = 8;

/** What a selection asks for, counting a fragment each time it's spread. */
interface Shape {
  readonly depth: number;
  readonly fields: number;
  readonly bits: number;
  /** Histories (`messages`) read. */
  readonly histories: number;
  /** Whether a history is read inside another. */
  readonly nested: boolean;
  /** Whether a history is read for more than its newest message. */
  readonly long: boolean;
}

const NOTHING: Shape = {
  depth: 0,
  fields: 0,
  bits: 0,
  histories: 0,
  nested: false,
  long: false,
};

const beside = (a: Shape, b: Shape): Shape => ({
  depth: Math.max(a.depth, b.depth),
  fields: a.fields + b.fields,
  bits: a.bits + b.bits,
  histories: a.histories + b.histories,
  nested: a.nested || b.nested,
  long: a.long || b.long,
});

/** Whether a history asks for its newest message alone, in so many words. */
const newestOnly = (field: FieldNode) =>
  field.arguments?.some(
    (argument) =>
      argument.name.value === 'limit' &&
      argument.value.kind === Kind.INT &&
      argument.value.value === '1'
  ) ?? false;

/**
 * An operation asks for a bounded amount of work, since a single instance
 * serves everyone. Aliases let one request ask for the same thing many times,
 * and `Message.chat` leads back to `Chat.messages`, so an operation:
 *
 * - goes at most MAX_DEPTH fields deep, and selects at most MAX_FIELDS fields
 *   and MAX_BITS `bits`;
 * - reads one history (`messages`) at most, never one inside another;
 * - as a subscription, which runs again for every event and every subscriber,
 *   reads no more of a history than its newest message (`limit: 1`).
 *
 * Introspection (`__schema`, `__type`) is the schema's own size, and isn't
 * counted.
 */
export function boundedQueries(context: ValidationContext): ASTVisitor {
  // Each fragment is measured once, however often it's spread: a fragment
  // spreading another twice, nested, would otherwise take exponential time.
  const fragments = new Map<string, Shape>();
  const shapeOf = (set: SelectionSetNode): Shape =>
    set.selections.reduce((shape, selection) => {
      if (selection.kind === Kind.INLINE_FRAGMENT) {
        return beside(shape, shapeOf(selection.selectionSet));
      }
      if (selection.kind === Kind.FRAGMENT_SPREAD) {
        const name = selection.name.value;
        if (!fragments.has(name)) {
          // Nothing while it's measured: a cycle, refused by another rule, adds nothing.
          fragments.set(name, NOTHING);
          const fragment = context.getFragment(name);
          fragments.set(
            name,
            fragment ? shapeOf(fragment.selectionSet) : NOTHING
          );
        }
        return beside(shape, fragments.get(name) ?? NOTHING);
      }
      const name = selection.name.value;
      if (name.startsWith('__')) return shape;
      const inner = selection.selectionSet
        ? shapeOf(selection.selectionSet)
        : NOTHING;
      const isHistory = name === 'messages';
      return beside(shape, {
        depth: inner.depth + 1,
        fields: inner.fields + 1,
        bits: inner.bits + (name === 'bits' ? 1 : 0),
        histories: inner.histories + (isHistory ? 1 : 0),
        nested: inner.nested || (isHistory && inner.histories > 0),
        long: inner.long || (isHistory && !newestOnly(selection)),
      });
    }, NOTHING);

  return {
    OperationDefinition(operation) {
      const shape = shapeOf(operation.selectionSet);
      const refuse = (message: string) =>
        context.reportError(new GraphQLError(message, { nodes: [operation] }));

      if (shape.depth > MAX_DEPTH) {
        refuse(`A query may go at most ${MAX_DEPTH} fields deep.`);
      }
      if (shape.fields > MAX_FIELDS) {
        refuse(`A query may select at most ${MAX_FIELDS} fields.`);
      }
      if (shape.bits > MAX_BITS) {
        refuse(`A query may select bits at most ${MAX_BITS} times.`);
      }
      if (shape.nested) {
        refuse('A query may not read messages inside messages.');
      } else if (shape.histories > 1) {
        refuse('A query may read one history (messages) at most.');
      }
      if (operation.operation === 'subscription' && shape.long) {
        refuse('A subscription may read only messages(limit: 1).');
      }
    },
  };
}
