import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getTraffpunkter, addTraffpunkt, getActivities, addActivity, updateActivity, deleteActivity } from '../services/statisticsService';
import { listUsers, updateUserRole } from '../services/adminService';
import {
    Box,
    Card,
    CardContent,
    Typography,
    TextField,
    Button,
    Alert,
    CircularProgress,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Divider,
    Paper,
    InputAdornment,
    IconButton,
    Collapse,
    useTheme,
    useMediaQuery,
    Chip,
    Stack,
    Switch
} from '@mui/material';
import {
    LocationOn as LocationIcon,
    Add as AddIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    Home as HomeIcon,
    Description as DescriptionIcon,
    Save as SaveIcon,
    Event as EventIcon,
    SportsEsports as ActivityIcon
} from '@mui/icons-material';

const Admin = () => {
    const { msalInstance, user } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [traffpunkter, setTraffpunkter] = useState([]);
    const [newTraffpunkt, setNewTraffpunkt] = useState({ name: '', address: '', description: '' });
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [expandedItems, setExpandedItems] = useState({});
    const [activities, setActivities] = useState([]);
    const [newActivity, setNewActivity] = useState({ name: '', description: '' });
    const [showAllTraffpunkter, setShowAllTraffpunkter] = useState(false);
    const [showAllActivities, setShowAllActivities] = useState(false);
    const [editingActivityId, setEditingActivityId] = useState(null);
    const [editingActivityName, setEditingActivityName] = useState('');
    const [activityActionLoading, setActivityActionLoading] = useState(false);
    // Role management (superadmin only)
    const [allUsers, setAllUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [userSearch, setUserSearch] = useState('');

    const fetchTraffpunkter = useCallback(async () => {
        if (!msalInstance || !user) return;
        try {
            const res = await getTraffpunkter(msalInstance, user.account);
            setTraffpunkter(res.data);
        } catch (err) {
            setError('Kunde inte ladda träffpunkter.');
        }
    }, [msalInstance, user]);

    const fetchActivities = useCallback(async () => {
        if (!msalInstance || !user) return;
        try {
            const res = await getActivities(msalInstance, user.account);
            setActivities(res.data);
        } catch (err) {
            setError('Kunde inte ladda aktiviteter.');
        }
    }, [msalInstance, user]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            await Promise.all([fetchTraffpunkter(), fetchActivities()]);
            setLoading(false);
        };
        fetchData();
    }, [fetchTraffpunkter, fetchActivities]);

    useEffect(() => {
        const fetchUsers = async () => {
            if (!msalInstance || !user || !user.is_superadmin) return;
            const q = (userSearch || '').trim();
            if (!q) {
                setAllUsers([]);
                setUsersLoading(false);
                return;
            }
            setUsersLoading(true);
            try {
                const res = await listUsers(msalInstance, user.account, { q, limit: 200 });
                const items = (res.data || []);
                const ql = q.toLowerCase();
                // Visa endast adresser som börjar med söktermen
                const filtered = items.filter(u => (u.email || '').toLowerCase().startsWith(ql));
                setAllUsers(filtered);
            } catch (e) {
                console.error('Failed to load users', e);
            } finally {
                setUsersLoading(false);
            }
        };
        fetchUsers();
    }, [msalInstance, user, userSearch]);

    const handleTraffpunktInputChange = (e) => {
        const { name, value } = e.target;
        setNewTraffpunkt({ ...newTraffpunkt, [name]: value });
    };

    const handleActivityInputChange = (e) => {
        const { name, value } = e.target;
        
        // Om det är namn-fältet, validera tecken
        if (name === 'name') {
            // Ta bort alla tecken som inte är tillåtna
            const cleanedValue = value.replace(/[^a-zA-ZåäöÅÄÖ0-9\s\-\_]/g, '');
            setNewActivity({ ...newActivity, [name]: cleanedValue });
        } else {
            setNewActivity({ ...newActivity, [name]: value });
        }
    };

    const handleSubmitTraffpunkt = async (e) => {
        e.preventDefault();
        if (!newTraffpunkt.name) {
            setError('Namn är ett obligatoriskt fält.');
            return;
        }
        setSubmitting(true);
        setError(null);
        setSuccess(null);
        try {
            await addTraffpunkt(msalInstance, user.account, newTraffpunkt);
            setSuccess(`Träffpunkt "${newTraffpunkt.name}" har lagts till.`);
            setNewTraffpunkt({ name: '', address: '', description: '' });
            await fetchTraffpunkter();
        } catch (err) {
            if (err.response && err.response.data && err.response.data.error) {
                setError(err.response.data.error);
            } else {
                setError('Kunde inte lägga till träffpunkt. Försök igen.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitActivity = async (e) => {
        e.preventDefault();
        if (!newActivity.name) {
            setError('Namn är ett obligatoriskt fält för aktivitet.');
            return;
        }
        setSubmitting(true);
        setError(null);
        setSuccess(null);
        try {
            await addActivity(msalInstance, user.account, newActivity);
            setSuccess(`Aktivitet "${newActivity.name}" har lagts till.`);
            setNewActivity({ name: '', description: '' });
            await fetchActivities();
        } catch (err) {
            if (err.response && err.response.data && err.response.data.error) {
                setError(err.response.data.error);
            } else {
                setError('Kunde inte lägga till aktivitet. Försök igen.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const toggleExpanded = (id) => {
        setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
    };

    if (!user?.is_admin && !user?.is_superadmin) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
                <Alert severity="warning">Du har inte behörighet att visa admin.</Alert>
            </Box>
        );
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ maxWidth: { xs: '100%', md: 800 }, mx: 'auto' }}>
            <Typography 
                variant={isMobile ? "h5" : "h4"} 
                component="h1" 
                gutterBottom 
                sx={{ mb: 4, fontWeight: 600, textAlign: 'center' }}
            >
                Admin
            </Typography>

            <Stack spacing={3}>
                {user?.is_superadmin && (
                    <Card elevation={isMobile ? 0 : 1}>
                        <CardContent sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                <Typography variant={isMobile ? "h6" : "h5"} component="h2">
                                    Rollhantering (endast Superadmin)
                                </Typography>
                            </Box>
                            <TextField
                                fullWidth
                                label="Sök e‑post"
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                size={isMobile ? 'small' : 'medium'}
                                sx={{ mb: 2 }}
                            />
                            {usersLoading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
                            ) : (
                                <>
                                    {!userSearch.trim() && (
                                        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                            Börja skriva en e‑postadress för att söka (t.ex. "a" för att visa adresser som börjar på a).
                                        </Typography>
                                    )}
                                    {userSearch.trim() && (
                                        <List sx={{ width: '100%' }}>
                                            {allUsers.map((u, idx) => (
                                                <React.Fragment key={u.id || u.oid || u.email}>
                                                    <ListItem sx={{ px: 0 }}>
                                                        <ListItemText primary={u.display_name || u.email} secondary={u.email} />
                                                        <Stack direction="row" alignItems="center" spacing={1}>
                                                            <Typography variant="body2">Admin</Typography>
                                                            <Switch
                                                                checked={!!(u.roles && u.roles.admin)}
                                                                onChange={async (e) => {
                                                                    const newVal = e.target.checked;
                                                                    try {
                                                                        await updateUserRole(msalInstance, user.account, { userId: u.id, admin: newVal });
                                                                        setAllUsers(prev => prev.map(x => (x.id === u.id ? { ...x, roles: { ...(x.roles || {}), admin: newVal } } : x)));
                                                                    } catch (err) {
                                                                        console.error('Failed to update role', err);
                                                                    }
                                                                }}
                                                                inputProps={{ 'aria-label': 'Toggle admin' }}
                                                            />
                                                        </Stack>
                                                    </ListItem>
                                                    {idx < allUsers.length - 1 && <Divider />}
                                                </React.Fragment>
                                            ))}
                                            {allUsers.length === 0 && (
                                                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                                                    Inga användare funna för "{userSearch}".
                                                </Typography>
                                            )}
                                        </List>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                )}
                <Card elevation={isMobile ? 0 : 1}>
                    <CardContent sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                            <AddIcon color="primary" sx={{ mr: 1 }} />
                            <Typography variant={isMobile ? "h6" : "h5"} component="h2">
                                Lägg till ny Träffpunkt
                            </Typography>
                        </Box>

                        {success && (
                            <Alert 
                                severity="success" 
                                sx={{ mb: 3 }}
                                onClose={() => setSuccess(null)}
                            >
                                {success}
                            </Alert>
                        )}
                        
                        {error && (
                            <Alert 
                                severity="error" 
                                sx={{ mb: 3 }}
                                onClose={() => setError(null)}
                            >
                                {error}
                            </Alert>
                        )}

                        <form onSubmit={handleSubmitTraffpunkt}>
                            <Stack spacing={3}>
                                <TextField
                                    fullWidth
                                    label="Namn"
                                    name="name"
                                    value={newTraffpunkt.name}
                                    onChange={handleTraffpunktInputChange}
                                    required
                                    size={isMobile ? "small" : "medium"}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <LocationIcon />
                                            </InputAdornment>
                                        ),
                                    }}
                                />
                                
                                <TextField
                                    fullWidth
                                    label="Adress (frivilligt)"
                                    name="address"
                                    value={newTraffpunkt.address}
                                    onChange={handleTraffpunktInputChange}
                                    size={isMobile ? "small" : "medium"}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <HomeIcon />
                                            </InputAdornment>
                                        ),
                                    }}
                                />
                                
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={isMobile ? 3 : 4}
                                    label="Beskrivning (frivilligt)"
                                    name="description"
                                    value={newTraffpunkt.description}
                                    onChange={handleTraffpunktInputChange}
                                    size={isMobile ? "small" : "medium"}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <DescriptionIcon />
                                            </InputAdornment>
                                        ),
                                    }}
                                />
                                
                                <Button
                                    type="submit"
                                    variant="contained"
                                    size="large"
                                    disabled={submitting || !msalInstance}
                                    endIcon={submitting ? <CircularProgress size={20} /> : <SaveIcon />}
                                    fullWidth={isMobile}
                                    sx={{ 
                                        px: 4,
                                        py: 1.5,
                                        fontSize: '1rem',
                                        fontWeight: 600,
                                        alignSelf: isMobile ? 'stretch' : 'flex-start'
                                    }}
                                >
                                    {submitting ? 'Sparar...' : 'Spara Träffpunkt'}
                                </Button>
                            </Stack>
                        </form>
                    </CardContent>
                </Card>

                <Card elevation={isMobile ? 0 : 1}>
                    <CardContent sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                            <LocationIcon color="primary" sx={{ mr: 1 }} />
                            <Typography variant={isMobile ? "h6" : "h5"} component="h2">
                                Befintliga Träffpunkter
                            </Typography>
                            <Chip 
                                label={traffpunkter.length} 
                                size="small" 
                                color="primary" 
                                sx={{ ml: 2 }}
                            />
                        </Box>
                        
                        <List sx={{ width: '100%' }}>
                            {traffpunkter.slice(0, showAllTraffpunkter ? traffpunkter.length : 3).map((t, index) => (
                                <React.Fragment key={t.id}>
                                    <ListItem 
                                        sx={{ 
                                            px: 0,
                                            py: 2,
                                            '&:hover': {
                                                backgroundColor: 'action.hover',
                                                borderRadius: 1
                                            }
                                        }}
                                    >
                                        <ListItemIcon>
                                            <LocationIcon color="action" />
                                        </ListItemIcon>
                                        <ListItemText 
                                            primary={
                                                <Typography variant="body1" fontWeight={500}>
                                                    {t.name}
                                                </Typography>
                                            }
                                            secondary={t.address || 'Ingen adress angiven'}
                                        />
                                        {t.description && (
                                            <IconButton 
                                                size="small" 
                                                onClick={() => toggleExpanded(t.id)}
                                                sx={{ ml: 1 }}
                                            >
                                                {expandedItems[t.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                            </IconButton>
                                        )}
                                    </ListItem>
                                    {t.description && (
                                        <Collapse in={expandedItems[t.id]}>
                                            <Paper 
                                                elevation={0} 
                                                sx={{ 
                                                    p: 2, 
                                                    ml: 7, 
                                                    mb: 2, 
                                                    backgroundColor: 'background.default',
                                                    border: 1,
                                                    borderColor: 'divider'
                                                }}
                                            >
                                                <Typography variant="body2" color="text.secondary">
                                                    {t.description}
                                                </Typography>
                                            </Paper>
                                        </Collapse>
                                    )}
                                    {index < (showAllTraffpunkter ? traffpunkter.length : Math.min(3, traffpunkter.length)) - 1 && <Divider />}
                                </React.Fragment>
                            ))}
                        </List>
                        
                        {traffpunkter.length > 3 && (
                            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                                <Button
                                    onClick={() => setShowAllTraffpunkter(!showAllTraffpunkter)}
                                    endIcon={showAllTraffpunkter ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                    size="small"
                                    color="primary"
                                >
                                    {showAllTraffpunkter ? 'Visa färre' : `Visa alla ${traffpunkter.length} träffpunkter`}
                                </Button>
                            </Box>
                        )}
                    </CardContent>
                </Card>

                <Card elevation={isMobile ? 0 : 1}>
                    <CardContent sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                            <AddIcon color="primary" sx={{ mr: 1 }} />
                            <Typography variant={isMobile ? "h6" : "h5"} component="h2">
                                Lägg till ny Aktivitet
                            </Typography>
                        </Box>

                        <form onSubmit={handleSubmitActivity}>
                            <Stack spacing={3}>
                                <TextField
                                    fullWidth
                                    label="Namn"
                                    name="name"
                                    value={newActivity.name}
                                    onChange={handleActivityInputChange}
                                    required
                                    size={isMobile ? "small" : "medium"}
                                    helperText={`Endast bokstäver, siffror, mellanslag, bindestreck och understreck (${newActivity.name.length}/100)`}
                                    error={newActivity.name.length > 100}
                                    inputProps={{ maxLength: 100 }}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <EventIcon />
                                            </InputAdornment>
                                        ),
                                    }}
                                />
                                
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={isMobile ? 2 : 3}
                                    label="Beskrivning (frivilligt)"
                                    name="description"
                                    value={newActivity.description}
                                    onChange={handleActivityInputChange}
                                    size={isMobile ? "small" : "medium"}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <DescriptionIcon />
                                            </InputAdornment>
                                        ),
                                    }}
                                />
                                
                                <Button
                                    type="submit"
                                    variant="contained"
                                    size="large"
                                    disabled={submitting || !msalInstance}
                                    endIcon={submitting ? <CircularProgress size={20} /> : <SaveIcon />}
                                    fullWidth={isMobile}
                                    sx={{ 
                                        px: 4,
                                        py: 1.5,
                                        fontSize: '1rem',
                                        fontWeight: 600,
                                        alignSelf: isMobile ? 'stretch' : 'flex-start'
                                    }}
                                >
                                    {submitting ? 'Sparar...' : 'Spara Aktivitet'}
                                </Button>
                            </Stack>
                        </form>
                    </CardContent>
                </Card>

                <Card elevation={isMobile ? 0 : 1}>
                    <CardContent sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                            <ActivityIcon color="primary" sx={{ mr: 1 }} />
                            <Typography variant={isMobile ? "h6" : "h5"} component="h2">
                                Befintliga Aktiviteter
                            </Typography>
                            <Chip 
                                label={activities.length} 
                                size="small" 
                                color="primary" 
                                sx={{ ml: 2 }}
                            />
                        </Box>
                        
                        <List sx={{ width: '100%' }}>
                            {activities.slice(0, showAllActivities ? activities.length : 5).map((activity, index) => (
                                <React.Fragment key={activity.id}>
                                    <ListItem 
                                        sx={{ 
                                            px: 0,
                                            py: 2,
                                            '&:hover': {
                                                backgroundColor: 'action.hover',
                                                borderRadius: 1
                                            }
                                        }}
                                    >
                                        <ListItemIcon>
                                            <EventIcon color="action" />
                                        </ListItemIcon>
                                        {editingActivityId === activity.id ? (
                                            <Box sx={{ flex: 1, mr: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
                                                <TextField
                                                    value={editingActivityName}
                                                    onChange={(e) => setEditingActivityName(e.target.value.replace(/[^a-zA-ZåäöÅÄÖ0-9\s\-\_]/g, ''))}
                                                    size={isMobile ? 'small' : 'medium'}
                                                    label="Nytt namn"
                                                    fullWidth
                                                />
                                                <Button
                                                    variant="contained"
                                                    color="primary"
                                                    size={isMobile ? 'small' : 'medium'}
                                                    disabled={activityActionLoading || !editingActivityName.trim()}
                                                    onClick={async () => {
                                                        setActivityActionLoading(true);
                                                        setError(null); setSuccess(null);
                                                        try {
                                                            await updateActivity(msalInstance, user.account, { id: activity.id, name: editingActivityName.trim() });
                                                            setSuccess('Aktivitet uppdaterad.');
                                                            setEditingActivityId(null);
                                                            setEditingActivityName('');
                                                            await fetchActivities();
                                                        } catch (err) {
                                                            const msg = err?.response?.data?.error || 'Kunde inte uppdatera aktivitet.';
                                                            setError(msg);
                                                        } finally {
                                                            setActivityActionLoading(false);
                                                        }
                                                    }}
                                                >
                                                    Spara
                                                </Button>
                                                <Button
                                                    variant="text"
                                                    color="inherit"
                                                    size={isMobile ? 'small' : 'medium'}
                                                    onClick={() => { setEditingActivityId(null); setEditingActivityName(''); }}
                                                >
                                                    Avbryt
                                                </Button>
                                            </Box>
                                        ) : (
                                            <ListItemText 
                                                primary={
                                                    <Typography variant="body1" fontWeight={500}>
                                                        {activity.name}
                                                    </Typography>
                                                }
                                                secondary={activity.description || 'Ingen beskrivning'}
                                            />
                                        )}
                                        {editingActivityId !== activity.id && (
                                            <Stack direction="row" spacing={1}>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => { setEditingActivityId(activity.id); setEditingActivityName(activity.name); }}
                                                >
                                                    Byt namn
                                                </Button>
                                                <Button
                                                    size="small"
                                                    color="error"
                                                    variant="outlined"
                                                    disabled={activityActionLoading}
                                                    onClick={async () => {
                                                        if (!window.confirm(`Ta bort aktiviteten "${activity.name}"? Den kommer inte längre vara valbar vid registrering, men historisk data finns kvar.`)) return;
                                                        setActivityActionLoading(true);
                                                        setError(null); setSuccess(null);
                                                        try {
                                                            await deleteActivity(msalInstance, user.account, { id: activity.id });
                                                            setSuccess('Aktivitet borttagen.');
                                                            await fetchActivities();
                                                        } catch (err) {
                                                            const msg = err?.response?.data?.error || 'Kunde inte ta bort aktivitet.';
                                                            setError(msg);
                                                        } finally {
                                                            setActivityActionLoading(false);
                                                        }
                                                    }}
                                                >
                                                    Ta bort
                                                </Button>
                                            </Stack>
                                        )}
                                    </ListItem>
                                    {index < (showAllActivities ? activities.length : Math.min(5, activities.length)) - 1 && <Divider />}
                                </React.Fragment>
                            ))}
                            {activities.length === 0 && (
                                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                                    Inga aktiviteter har lagts till än
                                </Typography>
                            )}
                        </List>
                        
                        {activities.length > 5 && (
                            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                                <Button
                                    onClick={() => setShowAllActivities(!showAllActivities)}
                                    endIcon={showAllActivities ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                    size="small"
                                    color="primary"
                                >
                                    {showAllActivities ? 'Visa färre' : `Visa alla ${activities.length} aktiviteter`}
                                </Button>
                            </Box>
                        )}
                    </CardContent>
                </Card>
            </Stack>
        </Box>
    );
};

export default Admin;
