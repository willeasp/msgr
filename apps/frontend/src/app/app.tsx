import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import ModalStack from '../sacred/components/ModalStack';
import { useModalStack } from '../sacred/components/page/ModalContext';
import Chat from './pages/chat';
import { Later } from './components/dialogs';
import { SignedIn } from './components/SignedIn';
import styles from './app.module.css';

// The desktop loads with the app; the other pages the first time they show.
// The shell keeps them on the device too (public/sw.js).
const AdminPage = lazy(() => import('./pages/admin'));
const LoginPage = lazy(() => import('./pages/login'));
const NotFound = lazy(() => import('./pages/not-found'));
const SignUpPage = lazy(() => import('./pages/sign-up'));

/** Dims the page behind Sacred's modal stack, which draws no backdrop itself. */
function ModalBackdrop() {
  const modalStack = useModalStack();
  return modalStack.length > 0 ? (
    <div className={styles.backdrop} aria-hidden="true" />
  ) : null;
}

export function App() {
  return (
    <>
      <Routes>
        {/* Every signed-in view lives under SignedIn, which keeps the live
            feed, alerts and notifications going whichever is on screen. */}
        <Route element={<SignedIn />}>
          <Route path="/" element={<Chat />} />
          <Route
            path="/admin"
            element={
              <Later>
                <AdminPage />
              </Later>
            }
          />
          <Route path="/:chatId" element={<Chat />} />
        </Route>
        <Route
          path="/login"
          element={
            <Later>
              <LoginPage />
            </Later>
          }
        />
        <Route
          path="/invite/:code"
          element={
            <Later>
              <SignUpPage />
            </Later>
          }
        />
        <Route
          path="*"
          element={
            <Later>
              <NotFound />
            </Later>
          }
        />
      </Routes>
      <ModalBackdrop />
      <ModalStack />
    </>
  );
}

export default App;
