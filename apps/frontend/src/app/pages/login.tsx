import React, { useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { gql } from '../../lib/__generated__';
import AlertBanner from '../../sacred/components/AlertBanner';
import Button from '../../sacred/components/Button';
import Divider from '../../sacred/components/Divider';
import Input from '../../sacred/components/Input';
import { COMPUTER } from '../components/icons';
import { DialogButtons, MacDialog } from '../components/MacDialog';
import { MenuBar } from '../components/MenuBar';
import { PixelIcon } from '../components/PixelIcon';
import { Muted } from '../components/Muted';
import { ThemeMenu } from '../components/ThemeMenu';
import styles from './page.module.css';

const LOGIN_MUTATION = gql(`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      user {
        id
        email
        name
      }
    }
  }
`);

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [login, { loading }] = useMutation(LOGIN_MUTATION, {
    // The session arrives as an httpOnly cookie.
    onCompleted: () => navigate('/'),
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
    } catch {
      // Shown by onError.
    }
  };

  return (
    <div className={styles.screen}>
      <MenuBar menus={<ThemeMenu />} />
      <main className={styles.desktop}>
        <MacDialog title="Sign In">
          <div className={styles.welcome}>
            <PixelIcon bitmap={COMPUTER} scale={3} />
            <h1 className={styles.headline}>Welcome to Msgr.</h1>
          </div>
          <Divider />
          <form onSubmit={handleSubmit} className={styles.form}>
            {error && (
              <div role="alert">
                <AlertBanner>{error}</AlertBanner>
              </div>
            )}
            <Input
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <DialogButtons>
              {loading ? (
                <Button isDisabled>Signing In</Button>
              ) : (
                <Button type="submit">Sign In</Button>
              )}
            </DialogButtons>
            <Muted>New here? Ask a friend for an invite link.</Muted>
          </form>
        </MacDialog>
      </main>
    </div>
  );
};

export default LoginPage;
