import { Route, Routes } from 'react-router-dom';
import ModalStack from '../sacred/components/ModalStack';
import { useModals } from '../sacred/components/page/ModalContext';
import AdminPage from './pages/admin';
import Chat from './pages/chat';
import LoginPage from './pages/login';
import NotFound from './pages/not-found';
import SignUpPage from './pages/sign-up';
import { SignedIn } from './components/SignedIn';
import styles from './app.module.css';

/** Dims the page behind Sacred's modal stack, which draws no backdrop itself. */
function ModalBackdrop() {
  const { modalStack } = useModals();
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
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/:chatId" element={<Chat />} />
        </Route>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:code" element={<SignUpPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <ModalBackdrop />
      <ModalStack />
    </>
  );
}

export default App;
