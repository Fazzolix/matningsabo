import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getTraffpunkter, getActivities, registerAttendance } from '../services/statisticsService';
import { toISODateString } from '../utils/dateHelpers';
import { PARTICIPANT_KEYS, PARTICIPANT_LABELS, makeEmptyParticipants } from '../config/participants';
import {
    Box,
    Card,
    CardContent,
    Typography,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    RadioGroup,
    FormControlLabel,
    Radio,
    Button,
    Grid,
    Alert,
    CircularProgress,
    Autocomplete,
    useTheme,
    useMediaQuery,
    Paper,
    InputAdornment,
    Divider,
    Chip,
    Stack,
    IconButton
} from '@mui/material';
import {
    People as PeopleIcon,
    Man as ManIcon,
    Woman as WomanIcon,
    CalendarToday as CalendarIcon,
    LocationOn as LocationOnIcon,
    Event as EventIcon,
    Send as SendIcon,
    Add as AddIcon,
    Remove as RemoveIcon
} from '@mui/icons-material';

const NumberInput = ({ value, onChange, label, icon, isMobile }) => {
    const intervalRef = useRef(null);
    const timeoutRef = useRef(null);
    const [isHolding, setIsHolding] = React.useState(false);

    const handleIncrement = () => {
        onChange(value + 1);
    };

    const handleDecrement = () => {
        if (value > 0) {
            onChange(value - 1);
        }
    };

    const startHolding = (action) => {
        setIsHolding(true);
        action();
        
        // Start with single increment after 500ms
        timeoutRef.current = setTimeout(() => {
            // Then repeat every 100ms for fast increment
            intervalRef.current = setInterval(() => {
                action();
            }, 100);
        }, 500);
    };

    const stopHolding = () => {
        setIsHolding(false);
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    return (
        <Box sx={{ width: '100%' }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                {label}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%' }}>
                {icon}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 3,
                        backgroundColor: 'background.paper',
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        transition: 'all 0.2s',
                        '&:focus-within': {
                            borderColor: 'primary.main',
                            boxShadow: theme => `0 0 0 2px ${theme.palette.primary.main}25`
                        }
                    }}
                >
                    <IconButton
                        onPointerDown={(e) => { e.preventDefault(); startHolding(handleDecrement); }}
                        onPointerUp={stopHolding}
                        onPointerLeave={stopHolding}
                        onPointerCancel={stopHolding}
                        disabled={value === 0}
                        sx={{
                            borderRadius: '12px 0 0 12px',
                            p: isMobile ? 1.5 : 1,
                            '&:hover': {
                                backgroundColor: 'action.hover'
                            },
                            '&:active': {
                                transform: 'scale(0.95)'
                            },
                            transition: 'all 0.15s',
                            minWidth: isMobile ? 56 : 48
                        }}
                    >
                        <RemoveIcon fontSize={isMobile ? "medium" : "small"} />
                    </IconButton>
                    
                    <TextField
                        value={value}
                        onChange={(e) => {
                            const val = e.target.value;
                            const num = val === '' ? 0 : parseInt(val, 10);
                            if (!isNaN(num) && num >= 0) {
                                onChange(num);
                            }
                        }}
                        inputProps={{
                            min: 0,
                            style: {
                                textAlign: 'center',
                                MozAppearance: 'textfield',
                                fontSize: isMobile ? '1.2rem' : '1rem',
                                fontWeight: 500
                            }
                        }}
                        sx={{
                            flex: 1,
                            '& .MuiOutlinedInput-root': {
                                border: 'none',
                                '& fieldset': {
                                    border: 'none',
                                },
                            },
                            '& input[type=number]': {
                                MozAppearance: 'textfield',
                            },
                            '& input[type=number]::-webkit-outer-spin-button': {
                                WebkitAppearance: 'none',
                                margin: 0,
                            },
                            '& input[type=number]::-webkit-inner-spin-button': {
                                WebkitAppearance: 'none',
                                margin: 0,
                            }
                        }}
                    />
                    
                    <IconButton
                        onPointerDown={(e) => { e.preventDefault(); startHolding(handleIncrement); }}
                        onPointerUp={stopHolding}
                        onPointerLeave={stopHolding}
                        onPointerCancel={stopHolding}
                        sx={{
                            borderRadius: '0 12px 12px 0',
                            p: isMobile ? 1.5 : 1,
                            backgroundColor: 'primary.main',
                            color: 'primary.contrastText',
                            '&:hover': {
                                backgroundColor: 'primary.dark'
                            },
                            '&:active': {
                                transform: 'scale(0.95)'
                            },
                            transition: 'all 0.15s',
                            minWidth: isMobile ? 56 : 48
                        }}
                    >
                        <AddIcon fontSize={isMobile ? "medium" : "small"} />
                    </IconButton>
                </Box>
            </Box>
        </Box>
    );
};

const ParticipantInput = ({ label, value, onChange, icon }) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const handleChange = (field, val) => {
        onChange({ ...value, [field]: val });
    };

    return (
        <Paper 
            elevation={0} 
            sx={{ 
                p: { xs: 2.5, sm: 3, md: 3.5 }, 
                border: 1, 
                borderColor: 'divider',
                borderRadius: 2,
                transition: 'all 0.2s',
                width: '100%',
                height: '100%',
                '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: 1
                }
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                {icon}
                <Typography variant="h6" fontWeight={600} sx={{ ml: 1 }}>
                    {label}
                </Typography>
            </Box>
            <Stack spacing={3} sx={{ width: '100%' }}>
                <NumberInput
                    value={value.men}
                    onChange={(val) => handleChange('men', val)}
                    label="Män"
                    icon={<ManIcon color="action" fontSize="small" />}
                    isMobile={isMobile}
                />
                <NumberInput
                    value={value.women}
                    onChange={(val) => handleChange('women', val)}
                    label="Kvinnor"
                    icon={<WomanIcon color="action" fontSize="small" />}
                    isMobile={isMobile}
                />
            </Stack>
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                <Chip 
                    label={`Totalt: ${value.men + value.women}`} 
                    size="medium" 
                    color="primary" 
                    variant="outlined"
                    sx={{ fontWeight: 600, fontSize: '1rem' }}
                />
            </Box>
        </Paper>
    );
};

const ResponsiveRegistration = () => {
    const { msalInstance, user } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const isTablet = useMediaQuery(theme.breakpoints.down('md'));
    
    const [traffpunkter, setTraffpunkter] = useState([]);
    const [activities, setActivities] = useState([]);
    const [formData, setFormData] = useState({
        traffpunkt_id: '',
        date: toISODateString(new Date()),
        time_block: 'fm',
        activity: '',
        participants: makeEmptyParticipants(),
    });
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Alfabetisk lista över aktivitetsnamn (svensk sortering)
    const activityOptions = useMemo(() => {
        return (activities || [])
            .map(a => a && a.name)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'sv', { sensitivity: 'base' }));
    }, [activities]);

    useEffect(() => {
        const fetchData = async () => {
            if (!msalInstance || !user) return;
            try {
                setLoading(true);
                const [traffpunkterRes, activitiesRes] = await Promise.all([
                    getTraffpunkter(msalInstance, user.account),
                    getActivities(msalInstance, user.account),
                ]);
                setTraffpunkter(traffpunkterRes.data);
                setActivities(activitiesRes.data);
                if (traffpunkterRes.data.length > 0) {
                    setFormData(prev => ({ ...prev, traffpunkt_id: traffpunkterRes.data[0].id }));
                }
            } catch (err) {
                setError('Kunde inte ladda nödvändig data. Försök ladda om sidan.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [msalInstance, user]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handleParticipantChange = (category, values) => {
        setFormData({
            ...formData,
            participants: {
                ...formData.participants,
                [category]: values,
            },
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.traffpunkt_id || !formData.activity) {
            setError('Vänligen fyll i alla obligatoriska fält.');
            return;
        }
        setSubmitting(true);
        setError(null);
        setSuccess(null);
        try {
            await registerAttendance(msalInstance, user.account, formData);
            setSuccess('Närvaro har registrerats!');
            // Reset form
            setFormData({
                ...formData,
                activity: '',
                participants: makeEmptyParticipants(),
            });
        } catch (err) {
            setError('Kunde inte registrera närvaro. Försök igen.');
        } finally {
            setSubmitting(false);
        }
    };

    const getTotalParticipants = () => {
        return PARTICIPANT_KEYS.reduce((sum, key) => {
            const v = formData.participants?.[key] || { men: 0, women: 0 };
            return sum + (v.men || 0) + (v.women || 0);
        }, 0);
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error && !loading) {
        return (
            <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
                <Alert severity="error">{error}</Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ width: '100%' }}>
            <Typography 
                variant={isMobile ? "h4" : "h3"} 
                component="h1" 
                gutterBottom 
                sx={{ mb: 4, fontWeight: 700, textAlign: 'center' }}
            >
                Registrera Närvaro
            </Typography>

            <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
                <form onSubmit={handleSubmit}>
                    <Stack spacing={4}>
                        {/* Alert Messages */}
                        {(success || error) && (
                            <Box>
                                {success && (
                                    <Alert 
                                        severity="success" 
                                        onClose={() => setSuccess(null)}
                                        sx={{ mb: 2 }}
                                    >
                                        {success}
                                    </Alert>
                                )}
                                {error && (
                                    <Alert 
                                        severity="error" 
                                        onClose={() => setError(null)}
                                    >
                                        {error}
                                    </Alert>
                                )}
                            </Box>
                        )}

                        {/* Top Section - Träffpunkt and Date */}
                        <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, border: 1, borderColor: 'divider' }}>
                            <Grid container spacing={3}>
                                <Grid item xs={12} md={6}>
                                    <FormControl fullWidth required size={isMobile ? "medium" : "large"}>
                                        <InputLabel>Träffpunkt</InputLabel>
                                        <Select
                                            name="traffpunkt_id"
                                            value={formData.traffpunkt_id}
                                            onChange={handleInputChange}
                                            label="Träffpunkt"
                                            startAdornment={<LocationOnIcon sx={{ mr: 1, color: 'action.active' }} />}
                                        >
                                            {traffpunkter.map(t => (
                                                <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                
                                <Grid item xs={12} md={6}>
                                    <TextField
                                        fullWidth
                                        type="date"
                                        name="date"
                                        label="Datum"
                                        value={formData.date}
                                        onChange={handleInputChange}
                                        required
                                        size={isMobile ? "medium" : "large"}
                                        InputLabelProps={{ shrink: true }}
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <CalendarIcon />
                                                </InputAdornment>
                                            ),
                                        }}
                                    />
                                </Grid>
                            </Grid>
                        </Paper>

                        {/* Time Selection */}
                        <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, border: 1, borderColor: 'divider' }}>
                            <FormControl component="fieldset">
                                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                                    Tid på dagen
                                </Typography>
                                <RadioGroup
                                    row
                                    name="time_block"
                                    value={formData.time_block}
                                    onChange={handleInputChange}
                                    sx={{ mt: 1 }}
                                >
                                    <FormControlLabel 
                                        value="fm" 
                                        control={<Radio />} 
                                        label={<Typography variant="body1">Förmiddag</Typography>}
                                        sx={{ mr: 4 }}
                                    />
                                    <FormControlLabel 
                                        value="em" 
                                        control={<Radio />} 
                                        label={<Typography variant="body1">Eftermiddag</Typography>}
                                        sx={{ mr: 4 }}
                                    />
                                    <FormControlLabel 
                                        value="kv" 
                                        control={<Radio />} 
                                        label={<Typography variant="body1">Kväll</Typography>}
                                    />
                                </RadioGroup>
                            </FormControl>
                        </Paper>

                        {/* Activity Selection - Full Width */}
                        <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, border: 1, borderColor: 'divider' }}>
                            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                                Aktivitet
                            </Typography>
                            <Autocomplete
                                options={activityOptions}
                                value={formData.activity}
                                onChange={(e, newValue) => {
                                    setFormData({ ...formData, activity: newValue || '' });
                                }}
                                fullWidth
                                size={isMobile ? "medium" : "large"}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        fullWidth
                                        label="Välj aktivitet"
                                        required
                                        placeholder="Sök aktivitet..."
                                        InputProps={{
                                            ...params.InputProps,
                                            startAdornment: (
                                                <>
                                                    <InputAdornment position="start">
                                                        <EventIcon color="primary" />
                                                    </InputAdornment>
                                                    {params.InputProps.startAdornment}
                                                </>
                                            ),
                                        }}
                                    />
                                )}
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        fontSize: isMobile ? '1.1rem' : '1.2rem',
                                    }
                                }}
                            />
                        </Paper>

                        {/* Participants Section */}
                        <Box>
                            <Grid container spacing={3}>
                                {PARTICIPANT_KEYS.map((key) => {
                                    const colorMap = {
                                        boende: 'primary',
                                        trygghetsboende: 'info',
                                        externa: 'secondary',
                                        nya: 'success',
                                    };
                                    return (
                                        <Grid item xs={12} sm={6} lg={3} key={key}>
                                            <ParticipantInput
                                                label={PARTICIPANT_LABELS[key]}
                                                value={formData.participants[key]}
                                                onChange={(v) => handleParticipantChange(key, v)}
                                                icon={<PeopleIcon color={colorMap[key]} sx={{ fontSize: 28 }} />}
                                            />
                                        </Grid>
                                    );
                                })}
                            </Grid>
                        </Box>

                        {/* Submit Section */}
                        <Paper 
                            elevation={0} 
                            sx={{ 
                                p: { xs: 3, md: 4 }, 
                                border: 1, 
                                borderColor: 'divider',
                                backgroundColor: 'grey.50'
                            }}
                        >
                            <Stack 
                                direction={{ xs: 'column', sm: 'row' }} 
                                spacing={3} 
                                alignItems="center"
                                justifyContent="space-between"
                            >
                                <Box>
                                    <Typography variant="h6" color="text.primary">
                                        Totalt antal deltagare: 
                                    </Typography>
                                    <Typography variant="h4" color="primary" fontWeight={700}>
                                        {getTotalParticipants()}
                                    </Typography>
                                </Box>
                                
                                <Button
                                    type="submit"
                                    variant="contained"
                                    size="large"
                                    disabled={submitting || !msalInstance}
                                    endIcon={submitting ? <CircularProgress size={20} /> : <SendIcon />}
                                    sx={{ 
                                        minWidth: 200,
                                        py: 2,
                                        px: 4,
                                        fontSize: '1.1rem',
                                        fontWeight: 600
                                    }}
                                >
                                    {submitting ? 'Registrerar...' : 'Registrera Närvaro'}
                                </Button>
                            </Stack>
                        </Paper>
                    </Stack>
                </form>
            </Box>
        </Box>
    );
};

export default ResponsiveRegistration;
