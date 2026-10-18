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
  // Each fragment is walked once, however often it's spread, and the walk
  // stops at the second field: a fragment spreading another twice, nested,
  // would otherwise take exponential time, before anyone is signed in.
  const fieldsIn = new Map<string, number>();
  const rootFields = (set: SelectionSetNode): number => {
    let count = 0;
    for (const selection of set.selections) {
      if (selection.kind === Kind.FIELD) count += 1;
      else if (selection.kind === Kind.INLINE_FRAGMENT) {
        count += rootFields(selection.selectionSet);
      } else {
        const name = selection.name.value;
        if (!fieldsIn.has(name)) {
          // Zero while it's walked: a cycle, refused by another rule, adds nothing.
          fieldsIn.set(name, 0);
          const fragment = context.getFragment(name);
          fieldsIn.set(name, fragment ? rootFields(fragment.selectionSet) : 0);
        }
        count += fieldsIn.get(name) ?? 0;
      }
      if (count > 1) return count;
    }
    return count;
  };

  return {
    OperationDefinition(operation) {
      if (operation.operation !== 'mutation') return;
      if (rootFields(operation.selectionSet) > 1) {
        context.reportError(
          new GraphQLError('A mutation may select only one field.', {
            nodes: [operation],
          })
        );
      }
    },
  };
}
