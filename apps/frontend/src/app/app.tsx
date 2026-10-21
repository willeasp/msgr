import { Route, Routes } from 'react-router-dom';
import ModalStack from '../sacred/components/ModalStack';
import { useModals } from '../sacred/components/page/ModalContext';
import AdminPage from './pages/admin';
import Chat from './pages/chat';
import LoginPage from './pages/login';
import NotFound from './pages/not-found';
import SignUpPage from './pages/sign-up';
import ProtectedRoute from './auth/protected-route';
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
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/:chatId"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
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
