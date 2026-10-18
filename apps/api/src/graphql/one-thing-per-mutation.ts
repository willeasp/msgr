import {
  GraphQLError,
  Kind,
  type ASTVisitor,
  type SelectionSetNode,
  type ValidationContext,
} from 'graphql';

/**
 * A mutation does one thing: it selects a single root field. Aliases or
 * fragments could otherwise send thousands of messages, or movies the server
 * must decode, in one request.
 */
export function oneThingPerMutation(context: ValidationContext): ASTVisitor {
  const rootFields = (set: SelectionSetNode, seen: Set<string>): number =>
    set.selections.reduce((count, selection) => {
      if (selection.kind === Kind.FIELD) return count + 1;
      if (selection.kind === Kind.INLINE_FRAGMENT) {
        return count + rootFields(selection.selectionSet, seen);
      }
      const name = selection.name.value;
      const fragment = context.getFragment(name);
      if (!fragment || seen.has(name)) return count;
      return (
        count + rootFields(fragment.selectionSet, new Set([...seen, name]))
      );
    }, 0);

  return {
    OperationDefinition(operation) {
      if (operation.operation !== 'mutation') return;
      if (rootFields(operation.selectionSet, new Set()) > 1) {
        context.reportError(
          new GraphQLError('A mutation may select only one field.', {
            nodes: [operation],
          })
        );
      }
    },
  };
}
