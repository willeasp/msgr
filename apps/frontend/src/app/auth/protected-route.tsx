import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { gql } from '../../lib/__generated__';
import { useQuery } from '@apollo/client/react';

const ME = gql(`
  query GetMe {
    me {
      id
      email
      name
    }
  }
`);

const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({
  children,
}) => {
  const { data, loading, error } = useQuery(ME);
  const location = useLocation();

  // Optionally show a loader while auth state resolves
  if (loading) return <div>Loading...</div>;

  if (error || !data?.me) {
    // Redirect to /login and keep the attempted path in state
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};

export default ProtectedRoute;
