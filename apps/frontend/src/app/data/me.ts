import { gql } from '../../lib/__generated__';

/**
 * Who is signed in, or null: the app's first question, asked by many. And
 * whether they may see the admin page, which the menu bar needs as early,
 * and whether the server can search GIPHY for GIFs.
 */
export const ME = gql(`
  query GetMe {
    me {
      id
      email
      name
      avatar {
        width
        height
        url
      }
    }
    admin {
      __typename
    }
    gifsOn
  }
`);
