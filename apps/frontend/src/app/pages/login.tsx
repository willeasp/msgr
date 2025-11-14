import React, { useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { gql } from '../../lib/__generated__';

const LOGIN_MUTATION = gql(`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      user {
        id
        email
        name
      }
      token
    }
  }
`);

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [login, { loading }] = useMutation(LOGIN_MUTATION, {
    onCompleted: (data) => {
      // Store token in localStorage for WebSocket authentication
      if (data.login.token) {
        localStorage.setItem('authToken', data.login.token);
      }
      // Redirect to home/chat page on successful login
      navigate('/');
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await login({
        variables: {
          email,
          password,
        },
      });
    } catch (err) {
      // Error handled by onError callback
    }
  };

  return (
    <div className="max-w-md mx-auto mt-[100px] p-5">
      <h2 className="text-center mb-8">Login</h2>
      {error && (
        <div className="p-2.5 mb-5 bg-red-100 text-red-800 border border-red-200 rounded">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="mb-5">
          <label htmlFor="email" className="block mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full p-2.5 text-base border border-gray-300 rounded"
          />
        </div>
        <div className="mb-5">
          <label htmlFor="password" className="block mb-1">
            Password
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full p-2.5 text-base border border-gray-300 rounded"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full p-3 text-base bg-blue-600 text-white border-none rounded cursor-pointer hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed disabled:hover:bg-gray-500"
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
};

export default LoginPage;
