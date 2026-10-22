import { useMutation } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { gql } from '../../lib/__generated__';
import { GET_CHATS } from '../data/chats';

const JOIN_CHANNEL = gql(`
  mutation JoinChannel($name: String!) {
    joinChannel(name: $name) {
      id
      kind
      title
    }
  }
`);

/**
 * Joins (or creates) a channel by name and opens it. Resolves to `null` on
 * success, or to what went wrong in words people can act on.
 */
export function useJoinChannel() {
  const navigate = useNavigate();
  const [joinChannel, { loading }] = useMutation(JOIN_CHANNEL, {
    refetchQueries: [{ query: GET_CHATS }],
  });

  const join = async (name: string): Promise<string | null> => {
    try {
      const { data } = await joinChannel({ variables: { name } });
      if (data) navigate(`/${data.joinChannel.id}`);
      return null;
    } catch (error) {
      return CombinedGraphQLErrors.is(error)
        ? error.errors[0]?.message ?? 'Could not join that channel.'
        : 'Could not reach Msgr. Try again in a moment.';
    }
  };

  return { join, joining: loading };
}
