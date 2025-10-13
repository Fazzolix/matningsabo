import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import {
    Box,
    Container,
    Card,
    CardContent,
    Typography,
    Button,
    CircularProgress,
    Alert,
    useTheme,
    useMediaQuery,
    Stack
} from '@mui/material';
import { Microsoft as MicrosoftIcon } from '@mui/icons-material';

const ResponsiveWelcome = () => {
    const navigate = useNavigate();
    const { user, loading, error, login, isAuthenticated } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const isTablet = useMediaQuery(theme.breakpoints.down('md'));

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
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'background.default',
                px: { xs: 2, sm: 3 },
                py: { xs: 3, sm: 4 }
            }}
        >
            <AnimatePresence mode="wait">
                {loading ? (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                        <Container maxWidth="sm">
                            <Card elevation={isMobile ? 0 : 3}>
                                <CardContent sx={{ textAlign: 'center', py: { xs: 4, sm: 6 } }}>
                                    <Typography 
                                        variant={isMobile ? "h5" : "h4"} 
                                        component="h1" 
                                        gutterBottom
                                        sx={{ fontWeight: 600, mb: 3 }}
                                    >
                                        Träffpunktsstatistik
                                    </Typography>
                                    <Stack spacing={2} alignItems="center">
                                        <CircularProgress size={40} />
                                        <Typography color="text.secondary">
                                            Laddar autentisering...
                                        </Typography>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Container>
                    </motion.div>
                ) : (
                    <motion.div
                        key="main"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                    >
                        <Container maxWidth="sm">
                            <Card 
                                elevation={isMobile ? 0 : 3}
                                sx={{
                                    overflow: 'visible',
                                    position: 'relative'
                                }}
                            >
                                <CardContent 
                                    sx={{ 
                                        textAlign: 'center', 
                                        py: { xs: 4, sm: 6 },
                                        px: { xs: 3, sm: 6 }
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src="/skovde-logo-rod.png"
                                        alt="Skövde Kommun"
                                        sx={{
                                            height: { xs: 60, sm: 80, md: 100 },
                                            mb: { xs: 3, sm: 4 },
                                            mx: 'auto',
                                            display: 'block'
                                        }}
                                    />
                                    
                                    <Typography 
                                        variant={isMobile ? "h5" : isTablet ? "h4" : "h3"} 
                                        component="h1" 
                                        gutterBottom
                                        sx={{ 
                                            fontWeight: 600, 
                                            mb: 2,
                                            fontSize: { xs: '1.75rem', sm: '2.125rem', md: '2.5rem' }
                                        }}
                                    >
                                        Träffpunktsstatistik
                                    </Typography>
                                    
                                    <Typography 
                                        variant={isMobile ? "body2" : "body1"} 
                                        color="text.secondary"
                                        sx={{ 
                                            mb: { xs: 4, sm: 5 },
                                            px: { xs: 0, sm: 3, md: 5 },
                                            lineHeight: 1.6
                                        }}
                                    >
                                        Logga in med ditt Skövde kommun-konto för att registrera och visa statistik.
                                    </Typography>
                                    
                                    <Button
                                        variant="contained"
                                        size={isMobile ? "medium" : "large"}
                                        onClick={handleLogin}
                                        disabled={loading}
                                        startIcon={<MicrosoftIcon />}
                                        fullWidth={isMobile}
                                        sx={{
                                            py: { xs: 1.5, sm: 2 },
                                            px: { xs: 3, sm: 4 },
                                            fontSize: { xs: '0.875rem', sm: '1rem' },
                                            fontWeight: 600,
                                            textTransform: 'none',
                                            bgcolor: '#0078d4',
                                            '&:hover': {
                                                bgcolor: '#106ebe'
                                            },
                                            maxWidth: { sm: 300 }
                                        }}
                                    >
                                        Logga in med Microsoft
                                    </Button>
                                    
                                    {error && (
                                        <Box sx={{ mt: 3, px: { xs: 0, sm: 2 } }}>
                                            <Alert 
                                                severity="error" 
                                                variant="outlined"
                                                sx={{ 
                                                    textAlign: 'left',
                                                    '& .MuiAlert-message': {
                                                        fontSize: { xs: '0.813rem', sm: '0.875rem' }
                                                    }
                                                }}
                                            >
                                                Fel vid inloggning: {error.message || error}
                                            </Alert>
                                        </Box>
                                    )}
                                </CardContent>
                            </Card>
                            
                            <Box 
                                sx={{ 
                                    mt: 4, 
                                    textAlign: 'center',
                                    display: { xs: 'none', sm: 'block' }
                                }}
                            >
                                <Typography 
                                    variant="caption" 
                                    color="text.secondary"
                                >
                                    Skövde kommun - Träffpunktsstatistik
                                </Typography>
                            </Box>
                        </Container>
                    </motion.div>
                )}
            </AnimatePresence>
        </Box>
    );
};

export default ResponsiveWelcome;