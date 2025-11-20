import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import './Welcome.css';

const Welcome = () => {
  const navigate = useNavigate();
  const { user, loading, error, login, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, user, navigate]);

  const handleLogin = async () => {
    try {
      await login();
    } catch (err) {
      console.error('Inloggning misslyckades:', err);
    }
  };

  return (
    <div className="welcome-page-wrapper">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <div className="welcome-container">
              <div className="card welcome-card">
                <h1 className="welcome-title">SÄBO – Utevistelser</h1>
                <p className="loading-text">Laddar autentisering...</p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5, ease: 'ease-out' }}
          >
            <div className="welcome-container">
              <div className="card welcome-card">
                <img
                  src="/skovde-logo-rod.png"
                  alt="Skövde Kommun"
                  className="welcome-logo"
                />
                <h1 className="welcome-title">SÄBO – Utevistelser</h1>
                <p className="welcome-subtitle">
                  Logga in med ditt Skövde kommun-konto för att registrera utevistelser och se statistik.
                </p>
                <button
                  onClick={handleLogin}
                  className="azure-login-button"
                  disabled={loading}
                >
                  Logga in med Microsoft
                </button>
                {error && (
                  <p className="welcome-error">
                    Fel vid inloggning: {error.message || error}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Welcome;
