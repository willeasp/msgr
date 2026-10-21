import { gql } from '../../lib/__generated__';

/** Who is signed in, or null: the app's first question, asked by many. */
export const ME = gql(`
  query GetMe {
    me {
      id
      email
      name
      avatar {
        width
        height
        bits
      }
    }
  }
`);
