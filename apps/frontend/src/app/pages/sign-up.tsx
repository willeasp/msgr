import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { gql } from '../../lib/__generated__';
import { ME } from '../signed-in/me';
import { useSessionChange } from '../auth/use-session-change';
import AlertBanner from '../../sacred/components/AlertBanner';
import Button from '../../sacred/components/Button';
import Divider from '../../sacred/components/Divider';
import Input from '../../sacred/components/Input';
import { COMPUTER } from '../components/icons';
import { LoadingState } from '../components/LoadingState';
import {
  DialogButtons,
  DialogMessage,
  MacDialog,
} from '../components/MacDialog';
import { MenuBar } from '../components/MenuBar';
import { Muted } from '../components/Muted';
import { PixelIcon } from '../components/PixelIcon';
import { ThemeMenu } from '../components/ThemeMenu';
import styles from './page.module.css';

const SIGN_UP = gql(`
  mutation SignUp($input: SignUpInput!) {
    signUp(input: $input) {
      user {
        id
        name
      }
      chat {
        id
      }
    }
  }
`);

const INVITE_REDEEMABLE = gql(`
  query InviteRedeemable($code: String!) {
    inviteRedeemable(code: $code)
  }
`);

/** What to tell someone whose sign-up failed. */
function explain(error: unknown): string {
  const first = CombinedGraphQLErrors.is(error) ? error.errors[0] : undefined;
  if (first?.extensions?.['code'] === 'NOT_FOUND') {
    return 'This invite has been used or has expired. Ask for a new one.';
  }
  return first?.message ?? 'Could not reach Msgr. Try again in a moment.';
}

/** Where an invite link lands: "/invite/:code". */
export function SignUpPage() {
  const { code = '' } = useParams<{ code: string }>();
  const changeSession = useSessionChange();
  const session = useQuery(ME);
  const invite = useQuery(INVITE_REDEEMABLE, { variables: { code } });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The session arrives as an httpOnly cookie.
  const [signUp, { loading }] = useMutation(SIGN_UP, {
    // Straight into the chat with whoever sent the invite.
    onCompleted: ({ signUp }) =>
      changeSession(signUp.chat ? `/${signUp.chat.id}` : '/'),
    onError: (failure) => setError(explain(failure)),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await signUp({
        variables: { input: { inviteCode: code, name, email, password } },
      });
    } catch {
      // Shown by onError.
    }
  };

  // An invite works once, so someone back on theirs has already joined.
  if (session.data?.me) return <Navigate to="/" replace />;
  if (session.loading || invite.loading) {
    return <LoadingState label="Connecting" fill />;
  }
  if (invite.data?.inviteRedeemable === false) return <SpentInvite />;

  return (
    <div className={styles.screen}>
      <MenuBar menus={<ThemeMenu />} />
      <main className={styles.desktop}>
        <MacDialog title="Join Msgr">
          <div className={styles.welcome}>
            <PixelIcon bitmap={COMPUTER} scale={3} />
            <h1 className={styles.headline}>You’re invited.</h1>
            <Muted>Pick a name your friends will recognise.</Muted>
          </div>
          <Divider />
          <form onSubmit={handleSubmit} className={styles.form}>
            {error && (
              <div role="alert">
                <AlertBanner>{error}</AlertBanner>
              </div>
            )}
            <Input
              label="Name"
              name="name"
              autoComplete="name"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              name="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <DialogButtons>
              {loading ? (
                <Button isDisabled>Joining</Button>
              ) : (
                <Button type="submit">Join</Button>
              )}
            </DialogButtons>
          </form>
        </MacDialog>
      </main>
    </div>
  );
}

/** Said before anyone fills in the form. Used, expired and made-up look the same. */
function SpentInvite() {
  const navigate = useNavigate();
  return (
    <div className={styles.screen}>
      <MenuBar menus={<ThemeMenu />} />
      <main className={styles.desktop}>
        <MacDialog title="Join Msgr">
          <DialogMessage icon={COMPUTER}>
            <p className={styles.title}>
              This invite has been used or has expired.
            </p>
            <Muted>Ask for a new one, or sign in if it was yours.</Muted>
          </DialogMessage>
          <DialogButtons>
            <Button autoFocus onClick={() => navigate('/login')}>
              Sign In
            </Button>
          </DialogButtons>
        </MacDialog>
      </main>
    </div>
  );
}

export default SignUpPage;
