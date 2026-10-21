import { gql } from '../../lib/__generated__';

/** The viewer, or null when nobody is signed in; and whether they may see the admin page. */
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
    admin {
      __typename
    }
  }
`);
