import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ME } from '../data/me';
import { useQuery } from '@apollo/client/react';
import { LoadingState } from './LoadingState';

const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({
  children,
}) => {
  const { data, loading, error } = useQuery(ME);
  const location = useLocation();

  if (loading) return <LoadingState label="Connecting" fill />;

  if (error || !data?.me) {
    // Redirect to /login and keep the attempted path in state
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};

export default ProtectedRoute;
