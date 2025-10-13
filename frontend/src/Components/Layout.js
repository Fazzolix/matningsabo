import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

const Layout = ({ children }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    return (
        <div className="app-layout">
            <header className="app-header">
                <div className="header-content">
                    <div className="header-left">
                        <img src="/skovde-logo-rod.png" alt="Skövde Kommun" className="header-logo" />
                        <nav className="app-nav">
                            <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                                Dashboard
                            </NavLink>
                            <NavLink to="/registration" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                                Registrera
                            </NavLink>
                            <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                                Admin
                            </NavLink>
                        </nav>
                    </div>
                    <div className="header-right">
                        {user && <span className="user-name">{user.name}</span>}
                        <button onClick={handleLogout} className="logout-button">Logga ut</button>
                    </div>
                </div>
            </header>
            <main className="app-main">
                {children}
            </main>
        </div>
    );
};

export default Layout;