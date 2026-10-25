import React, { useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';
import { forgetOutbox } from '../data/outbox';
import { useSessionChange } from '../hooks/use-session-change';
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
  const changeSession = useSessionChange();

  const [login, { loading }] = useMutation(LOGIN_MUTATION, {
    // The session arrives as an httpOnly cookie.
    onCompleted: () => changeSession('/'),
    onError: (error) => {
      setError(error.message);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Nothing the last person sent may go once the cookie is someone else's.
    forgetOutbox();

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
              // Text, not email, whose caret Sacred's Input can't read;
              // the keyboard, the autofill and the server still know it.
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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
