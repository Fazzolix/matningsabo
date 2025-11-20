import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    getHomes,
    addHome,
    getActivities,
    addActivity,
    updateActivity,
    deleteActivity,
    getCompanions,
    addDepartment,
    updateDepartment,
    deleteDepartment,
    addCompanion,
    updateCompanion,
    deleteCompanion,
} from '../services/statisticsService';
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
    SportsEsports as ActivityIcon,
    People as PeopleIcon,
    Delete as DeleteIcon,
    Person as PersonIcon,
} from '@mui/icons-material';

const Admin = () => {
    const { msalInstance, user } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [homes, setHomes] = useState([]);
    const [newHome, setNewHome] = useState({ name: '', address: '', description: '' });
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [activities, setActivities] = useState([]);
    const [newActivity, setNewActivity] = useState({ name: '', description: '' });
    const [showAllHomes, setShowAllHomes] = useState(false);
    const [showAllActivities, setShowAllActivities] = useState(false);
    const [editingActivityId, setEditingActivityId] = useState(null);
    const [editingActivityName, setEditingActivityName] = useState('');
    const [activityActionLoading, setActivityActionLoading] = useState(false);
    const [companions, setCompanions] = useState([]);
    const [newCompanionName, setNewCompanionName] = useState('');
    const [companionEditingId, setCompanionEditingId] = useState(null);
    const [companionEditingName, setCompanionEditingName] = useState('');
    const [companionActionLoading, setCompanionActionLoading] = useState(false);
    const [newDepartmentNames, setNewDepartmentNames] = useState({});
    // Role management (superadmin only)
    const [allUsers, setAllUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [userSearch, setUserSearch] = useState('');

    const fetchHomes = useCallback(async () => {
        if (!msalInstance || !user) return;
        try {
            const res = await getHomes(msalInstance, user.account);
            setHomes(res.data);
        } catch (err) {
            setError('Kunde inte ladda äldreboenden.');
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

    const fetchCompanionsData = useCallback(async () => {
        if (!msalInstance || !user) return;
        try {
            const res = await getCompanions(msalInstance, user.account);
            setCompanions(res.data);
        } catch (err) {
            console.error('Failed to load companions', err);
        }
    }, [msalInstance, user]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            await Promise.all([fetchHomes(), fetchActivities(), fetchCompanionsData()]);
            setLoading(false);
        };
        fetchData();
    }, [fetchHomes, fetchActivities, fetchCompanionsData]);

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

    const handleHomeInputChange = (e) => {
        const { name, value } = e.target;
        setNewHome({ ...newHome, [name]: value });
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

    const handleDepartmentInputChange = (homeId, value) => {
        setNewDepartmentNames(prev => ({ ...prev, [homeId]: value }));
    };

    const handleAddDepartment = async (homeId) => {
        const name = (newDepartmentNames[homeId] || '').trim();
        if (!name) {
            setError('Namn är obligatoriskt för avdelning.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await addDepartment(msalInstance, user.account, { homeId, name });
            setNewDepartmentNames(prev => ({ ...prev, [homeId]: '' }));
            await fetchHomes();
        } catch (err) {
            const message = err?.response?.data?.error || 'Kunde inte lägga till avdelning.';
            setError(message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRenameDepartment = async (homeId, departmentId, name) => {
        if (!name.trim()) {
            setError('Avdelningsnamn får inte vara tomt.');
            return;
        }
        try {
            await updateDepartment(msalInstance, user.account, { homeId, departmentId, name: name.trim() });
            await fetchHomes();
        } catch (err) {
            setError('Kunde inte uppdatera avdelning.');
        }
    };

    const handleDeleteDepartment = async (homeId, departmentId) => {
        if (!window.confirm('Vill du ta bort avdelningen? Tidigare registreringar påverkas inte.')) return;
        try {
            await deleteDepartment(msalInstance, user.account, { homeId, departmentId });
            await fetchHomes();
        } catch (err) {
            setError('Kunde inte ta bort avdelning.');
        }
    };

    const handleAddCompanion = async () => {
        const name = newCompanionName.trim();
        if (!name) {
            setError('Namn är obligatoriskt för "Med vem".');
            return;
        }
        setCompanionActionLoading(true);
        setError(null);
        try {
            await addCompanion(msalInstance, user.account, { name });
            setNewCompanionName('');
            await fetchCompanionsData();
        } catch (err) {
            const message = err?.response?.data?.error || 'Kunde inte lägga till.';
            setError(message);
        } finally {
            setCompanionActionLoading(false);
        }
    };

    const handleSaveCompanion = async () => {
        if (!companionEditingId) return;
        const name = companionEditingName.trim();
        if (!name) {
            setError('Namn är obligatoriskt.');
            return;
        }
        setCompanionActionLoading(true);
        try {
            await updateCompanion(msalInstance, user.account, { id: companionEditingId, name });
            setCompanionEditingId(null);
            setCompanionEditingName('');
            await fetchCompanionsData();
        } catch (err) {
            setError('Kunde inte uppdatera "Med vem".');
        } finally {
            setCompanionActionLoading(false);
        }
    };

    const handleDeleteCompanion = async (id) => {
        if (!window.confirm('Vill du ta bort posten?')) return;
        setCompanionActionLoading(true);
        try {
            await deleteCompanion(msalInstance, user.account, { id });
            await fetchCompanionsData();
        } catch (err) {
            setError('Kunde inte ta bort posten.');
        } finally {
            setCompanionActionLoading(false);
        }
    };

    const handleSubmitHome = async (e) => {
        e.preventDefault();
        if (!newHome.name) {
            setError('Namn är ett obligatoriskt fält.');
            return;
        }
        setSubmitting(true);
        setError(null);
        setSuccess(null);
        try {
            await addHome(msalInstance, user.account, newHome);
            setSuccess(`Äldreboendet "${newHome.name}" har lagts till.`);
            setNewHome({ name: '', address: '', description: '' });
            await fetchHomes();
        } catch (err) {
            if (err.response && err.response.data && err.response.data.error) {
                setError(err.response.data.error);
            } else {
                setError('Kunde inte lägga till äldreboende. Försök igen.');
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
                                Lägg till nytt äldreboende
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

                        <form onSubmit={handleSubmitHome}>
                            <Stack spacing={3}>
                                <TextField
                                    fullWidth
                                    label="Namn"
                                    name="name"
                                    value={newHome.name}
                                    onChange={handleHomeInputChange}
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
                                    value={newHome.address}
                                    onChange={handleHomeInputChange}
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
                                    value={newHome.description}
                                    onChange={handleHomeInputChange}
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
                                    {submitting ? 'Sparar...' : 'Spara äldreboende'}
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
                                Befintliga äldreboenden
                            </Typography>
                            <Chip 
                                label={homes.length} 
                                size="small" 
                                color="primary" 
                                sx={{ ml: 2 }}
                            />
                        </Box>
                        
                        <Stack spacing={3}>
                            {homes
                                .slice(0, showAllHomes ? homes.length : 3)
                                .map((home) => (
                                    <Paper key={home.id} elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider' }}>
                                        <Stack spacing={1.5}>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <LocationIcon color="action" />
                                                <Typography variant="h6" sx={{ fontWeight: 600 }}>{home.name}</Typography>
                                                <Chip label={`${(home.departments || []).length}/20 avdelningar`} size="small" />
                                            </Stack>
                                            <Typography variant="body2" color="text.secondary">
                                                {home.address || 'Ingen adress angiven'}
                                            </Typography>
                                            {home.description && (
                                                <Typography variant="body2" color="text.secondary">
                                                    {home.description}
                                                </Typography>
                                            )}
                                            <Divider sx={{ my: 1 }} />
                                            <Stack spacing={1}>
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <PeopleIcon fontSize="small" />
                                                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Avdelningar</Typography>
                                                </Stack>
                                                {(home.departments || []).length === 0 && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Inga avdelningar registrerade ännu.
                                                    </Typography>
                                                )}
                                                {(home.departments || []).map((dept) => (
                                                    <Stack key={dept.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            defaultValue={dept.name}
                                                            onBlur={(e) => {
                                                                const value = e.target.value.trim();
                                                                if (value && value !== dept.name) {
                                                                    handleRenameDepartment(home.id, dept.id, value);
                                                                }
                                                            }}
                                                        />
                                                        <IconButton color="error" onClick={() => handleDeleteDepartment(home.id, dept.id)}>
                                                            <DeleteIcon />
                                                        </IconButton>
                                                    </Stack>
                                                ))}
                                                {home.departments && home.departments.length >= 20 && (
                                                    <Alert severity="info">Max 20 avdelningar per äldreboende.</Alert>
                                                )}
                                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="Ny avdelning"
                                                        value={newDepartmentNames[home.id] || ''}
                                                        onChange={(e) => handleDepartmentInputChange(home.id, e.target.value)}
                                                        disabled={submitting || (home.departments && home.departments.length >= 20)}
                                                    />
                                                    <Button
                                                        variant="contained"
                                                        startIcon={<AddIcon />}
                                                        onClick={() => handleAddDepartment(home.id)}
                                                        disabled={submitting || (home.departments && home.departments.length >= 20)}
                                                    >
                                                        Lägg till
                                                    </Button>
                                                </Stack>
                                            </Stack>
                                        </Stack>
                                    </Paper>
                                ))}
                        </Stack>
                        
                        {homes.length > 3 && (
                            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                                <Button
                                    onClick={() => setShowAllHomes(!showAllHomes)}
                                    endIcon={showAllHomes ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                    size="small"
                                    color="primary"
                                >
                                    {showAllHomes ? 'Visa färre' : `Visa alla ${homes.length} äldreboenden`}                                    
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

        <Card elevation={isMobile ? 0 : 1}>
            <CardContent sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                    <PersonIcon color="primary" sx={{ mr: 1 }} />
                    <Typography variant={isMobile ? 'h6' : 'h5'} component="h2">
                        "Med vem"-alternativ
                    </Typography>
                    <Chip label={companions.length} size="small" color="primary" sx={{ ml: 2 }} />
                </Box>

                <Stack spacing={2} sx={{ mb: 3 }}>
                    <TextField
                        label="Nytt namn"
                        fullWidth
                        value={newCompanionName}
                        onChange={(e) => setNewCompanionName(e.target.value.replace(/[^a-zA-ZåäöÅÄÖ0-9\s\-\_]/g, ''))}
                        size={isMobile ? 'small' : 'medium'}
                        inputProps={{ maxLength: 100 }}
                    />
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleAddCompanion}
                        disabled={companionActionLoading}
                        sx={{ alignSelf: isMobile ? 'stretch' : 'flex-start' }}
                    >
                        Lägg till
                    </Button>
                </Stack>

                <List>
                    {companions.length === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                            Inga poster har lagts till ännu.
                        </Typography>
                    )}
                    {companions.map((item, index) => (
                        <React.Fragment key={item.id}>
                            <ListItem sx={{ px: 0 }}>
                                {companionEditingId === item.id ? (
                                    <Box sx={{ flex: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
                                        <TextField
                                            value={companionEditingName}
                                            onChange={(e) => setCompanionEditingName(e.target.value.replace(/[^a-zA-ZåäöÅÄÖ0-9\s\-\_]/g, ''))}
                                            size={isMobile ? 'small' : 'medium'}
                                            fullWidth
                                        />
                                        <Button
                                            variant="contained"
                                            size={isMobile ? 'small' : 'medium'}
                                            disabled={companionActionLoading || !companionEditingName.trim()}
                                            onClick={handleSaveCompanion}
                                        >
                                            Spara
                                        </Button>
                                        <Button
                                            variant="text"
                                            size={isMobile ? 'small' : 'medium'}
                                            onClick={() => { setCompanionEditingId(null); setCompanionEditingName(''); }}
                                        >
                                            Avbryt
                                        </Button>
                                    </Box>
                                ) : (
                                    <ListItemText primary={item.name} />
                                )}
                                {companionEditingId !== item.id && (
                                    <Stack direction="row" spacing={1}>
                                        <Button size="small" onClick={() => { setCompanionEditingId(item.id); setCompanionEditingName(item.name); }}>
                                            Redigera
                                        </Button>
                                        <Button size="small" color="error" onClick={() => handleDeleteCompanion(item.id)}>
                                            Ta bort
                                        </Button>
                                    </Stack>
                                )}
                            </ListItem>
                            {index < companions.length - 1 && <Divider />}
                        </React.Fragment>
                    ))}
                </List>
            </CardContent>
        </Card>
            </Stack>
        </Box>
    );
};

export default Admin;
