import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    AppBar,
    Toolbar,
    IconButton,
    Typography,
    Button,
    Box,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    useTheme,
    useMediaQuery,
    Container,
    Avatar,
    Menu,
    MenuItem,
    Divider
} from '@mui/material';
import {
    Menu as MenuIcon,
    Dashboard as DashboardIcon,
    Assignment as AssignmentIcon,
    AdminPanelSettings as AdminIcon,
    Close as CloseIcon,
    Person as PersonIcon,
    Logout as LogoutIcon
} from '@mui/icons-material';

const ResponsiveLayout = ({ children }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const isTablet = useMediaQuery(theme.breakpoints.down('lg'));
    
    const [mobileOpen, setMobileOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState(null);

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    const handleUserMenuOpen = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleUserMenuClose = () => {
        setAnchorEl(null);
    };

    const baseNav = [
        { text: 'Dashboard', path: '/dashboard', icon: <DashboardIcon /> },
        { text: 'Registrera', path: '/registration', icon: <AssignmentIcon /> },
        { text: 'Mina registreringar', path: '/my', icon: <AssignmentIcon /> }
    ];
    const navItems = user?.is_admin || user?.is_superadmin
        ? [...baseNav, { text: 'Admin', path: '/admin', icon: <AdminIcon /> }]
        : baseNav;

    const drawer = (
        <Box sx={{ textAlign: 'center', height: '100%', bgcolor: 'background.paper' }}>
            <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                p: 2,
                borderBottom: 1,
                borderColor: 'divider'
            }}>
                <Box
                    component="img"
                    src="/skovde-logo-rod.png"
                    alt="Skövde Kommun"
                    sx={{ height: 32 }}
                />
                <IconButton onClick={handleDrawerToggle}>
                    <CloseIcon />
                </IconButton>
            </Box>
            
            <List sx={{ pt: 2 }}>
                {navItems.map((item) => (
                    <ListItem key={item.path} disablePadding>
                        <ListItemButton
                            component={NavLink}
                            to={item.path}
                            onClick={handleDrawerToggle}
                            sx={{
                                px: 3,
                                py: 1.5,
                                '&.active': {
                                    bgcolor: 'primary.light',
                                    color: 'primary.main',
                                    '& .MuiListItemIcon-root': {
                                        color: 'primary.main'
                                    }
                                }
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 40 }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText 
                                primary={item.text} 
                                primaryTypographyProps={{ 
                                    fontWeight: 500,
                                    fontSize: '1rem'
                                }}
                            />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
            
            <Box sx={{ position: 'absolute', bottom: 0, width: '100%', p: 2 }}>
                <Divider sx={{ mb: 2 }} />
                {user && (
                    <Box sx={{ textAlign: 'left', mb: 2 }}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            Inloggad som
                        </Typography>
                        <Typography variant="body1" fontWeight={500}>
                            {user.name}
                        </Typography>
                    </Box>
                )}
                <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<LogoutIcon />}
                    onClick={handleLogout}
                    sx={{ justifyContent: 'flex-start' }}
                >
                    Logga ut
                </Button>
            </Box>
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <AppBar position="sticky" color="default" elevation={1}>
                <Toolbar sx={{ 
                    px: { xs: 2, sm: 3, md: 4 },
                    minHeight: { xs: 56, sm: 64 }
                }}>
                    {isMobile && (
                        <IconButton
                            edge="start"
                            onClick={handleDrawerToggle}
                            sx={{ mr: 2 }}
                        >
                            <MenuIcon />
                        </IconButton>
                    )}
                    
                    <Box
                        component="img"
                        src="/skovde-logo-rod.png"
                        alt="Skövde Kommun"
                        sx={{ 
                            height: { xs: 28, sm: 32 },
                            mr: { xs: 'auto', md: 4 }
                        }}
                    />
                    
                    {!isMobile && (
                        <Box sx={{ display: 'flex', gap: { md: 2, lg: 3 }, flexGrow: 1 }}>
                            {navItems.map((item) => (
                                <Button
                                    key={item.path}
                                    component={NavLink}
                                    to={item.path}
                                    startIcon={!isTablet && item.icon}
                                    sx={{
                                        color: 'text.secondary',
                                        fontWeight: 500,
                                        fontSize: { md: '0.875rem', lg: '1rem' },
                                        px: { md: 1.5, lg: 2 },
                                        '&.active': {
                                            color: 'primary.main',
                                            borderBottom: 2,
                                            borderColor: 'primary.main',
                                            borderRadius: 0
                                        }
                                    }}
                                >
                                    {item.text}
                                </Button>
                            ))}
                        </Box>
                    )}
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {user && !isMobile && (
                            <Typography 
                                variant="body1" 
                                sx={{ 
                                    fontWeight: 500,
                                    display: { xs: 'none', md: 'block' }
                                }}
                            >
                                {user.name}
                            </Typography>
                        )}
                        
                        {isMobile ? (
                            <IconButton onClick={handleUserMenuOpen}>
                                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                                    <PersonIcon sx={{ fontSize: 20 }} />
                                </Avatar>
                            </IconButton>
                        ) : (
                            <Button
                                variant="outlined"
                                onClick={handleLogout}
                                size={isTablet ? 'small' : 'medium'}
                                sx={{ 
                                    borderColor: 'divider',
                                    color: 'text.primary',
                                    '&:hover': {
                                        borderColor: 'text.secondary',
                                        bgcolor: 'action.hover'
                                    }
                                }}
                            >
                                Logga ut
                            </Button>
                        )}
                    </Box>
                </Toolbar>
            </AppBar>
            
            <Drawer
                variant="temporary"
                open={mobileOpen}
                onClose={handleDrawerToggle}
                ModalProps={{
                    keepMounted: true
                }}
                sx={{
                    display: { xs: 'block', md: 'none' },
                    '& .MuiDrawer-paper': { 
                        boxSizing: 'border-box', 
                        width: 280,
                        maxWidth: '80vw'
                    }
                }}
            >
                {drawer}
            </Drawer>
            
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleUserMenuClose}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
            >
                {user && (
                    <Box sx={{ px: 2, py: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            Inloggad som
                        </Typography>
                        <Typography variant="body1" fontWeight={500}>
                            {user.name}
                        </Typography>
                    </Box>
                )}
                <Divider sx={{ my: 1 }} />
                <MenuItem onClick={() => { handleUserMenuClose(); handleLogout(); }}>
                    <ListItemIcon>
                        <LogoutIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Logga ut</ListItemText>
                </MenuItem>
            </Menu>
            
            <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default' }}>
                <Container 
                    maxWidth={false} 
                    sx={{ 
                        py: { xs: 2, sm: 3, md: 4 },
                        px: { xs: 2, sm: 3, md: 3 }
                    }}
                >
                    {children}
                </Container>
            </Box>
        </Box>
    );
};

export default ResponsiveLayout;
