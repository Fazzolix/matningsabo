import React, { createContext, useState, useEffect, useContext } from 'react';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import axios from 'axios';
import API_ENDPOINTS from '../config/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [msalInstance, setMsalInstance] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeMsal = async () => {
      try {
        const response = await axios.get(API_ENDPOINTS.AZURE_CONFIG);
        const config = response.data;

        const msalConfig = {
          auth: {
            clientId: config.clientId,
            authority: `https://login.microsoftonline.com/${config.tenantId}`,
            redirectUri: config.redirectUri,
            postLogoutRedirectUri: config.redirectUri,
            navigateToLoginRequestUrl: false
          },
          cache: {
            cacheLocation: 'localStorage',
            storeAuthStateInCookie: true
          }
        };

        const instance = new PublicClientApplication(msalConfig);
        await instance.initialize();
        setMsalInstance(instance);

        const redirectResponse = await instance.handleRedirectPromise();
        if (redirectResponse) {
          await handleLoginResponse(instance, redirectResponse);
        } else {
          const accounts = instance.getAllAccounts();
          if (accounts.length > 0) {
            try {
                const silentResponse = await instance.acquireTokenSilent({
                    scopes: ['User.Read'],
                    account: accounts[0]
                });
                await handleLoginResponse(instance, silentResponse);
            } catch (err) {
                if (err instanceof InteractionRequiredAuthError) {
                    console.log("Silent token acquisition failed. User interaction is required.");
                }
            }
          }
        }
      } catch (err) {
        console.error('MSAL initialization failed:', err);
        setError('Kunde inte initiera autentisering.');
      } finally {
        setLoading(false);
      }
    };

    initializeMsal();
  }, []);

  const handleLoginResponse = async (instance, response) => {
    try {
      const userResponse = await axios.get(API_ENDPOINTS.AZURE_USER, {
        headers: { 'Authorization': `Bearer ${response.accessToken}` }
      });
      setUser({ ...userResponse.data, account: response.account });
    } catch (err) {
      console.error('Failed to fetch user info after login:', err);
      setError('Kunde inte hämta användarinformation.');
      await instance.logoutPopup();
    }
  };

  const login = async () => {
    if (!msalInstance) return;
    try {
      // Use redirect flow which is more robust
      await msalInstance.loginRedirect({ scopes: ['User.Read', 'profile', 'openid', 'email'] });
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.message);
    }
  };

  const logout = async () => {
    if (!msalInstance) return;
    try {
      await msalInstance.logoutPopup({ postLogoutRedirectUri: window.location.origin });
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // This is the key change: we pass the msalInstance itself
  const value = {
    msalInstance,
    user,
    loading,
    error,
    login,
    logout,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};