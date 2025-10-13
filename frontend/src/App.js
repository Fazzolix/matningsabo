import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ResponsiveWelcome from './Components/ResponsiveWelcome';
import ResponsiveRegistration from './Components/ResponsiveRegistration';
import Dashboard from './Components/Dashboard';
import ResponsiveLayout from './Components/ResponsiveLayout';

import Admin from './Components/Admin';
import MyRegistrations from './Components/MyRegistrations';

const PrivateRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    if (loading) {
        return <div className="fullscreen-loader">Laddar...</div>;
    }
    return isAuthenticated ? children : <Navigate to="/" />;
};

const App = () => {
    return (
        <AuthProvider>
            <Router>
                <Routes>
                    <Route path="/" element={<ResponsiveWelcome />} />
                    <Route 
                        path="/registration" 
                        element={<PrivateRoute><ResponsiveLayout><ResponsiveRegistration /></ResponsiveLayout></PrivateRoute>} 
                    />
                    <Route 
                        path="/dashboard" 
                        element={<PrivateRoute><ResponsiveLayout><Dashboard /></ResponsiveLayout></PrivateRoute>} 
                    />
                    <Route 
                        path="/my" 
                        element={<PrivateRoute><ResponsiveLayout><MyRegistrations /></ResponsiveLayout></PrivateRoute>} 
                    />
                    <Route 
                        path="/admin" 
                        element={<PrivateRoute><ResponsiveLayout><Admin /></ResponsiveLayout></PrivateRoute>} 
                    />
                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
            </Router>
        </AuthProvider>
    );
};

export default App;
