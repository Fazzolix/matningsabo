import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getHomes, getActivities, getCompanions, registerVisit } from '../services/statisticsService';
import { toISODateString } from '../utils/dateHelpers';
import {
  makeEmptyGenderCounts,
  ensureGenderCounts,
  GENDER_OPTIONS,
  OFFER_STATUS,
  VISIT_TYPES,
  SATISFACTION_MAX,
  SATISFACTION_MIN,
} from '../config/participants';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Rating,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  AccessTime as AccessTimeIcon,
  CalendarToday as CalendarIcon,
  Delete as DeleteIcon,
  Event as EventIcon,
  Group as GroupIcon,
  Man as ManIcon,
  Person as PersonIcon,
  Woman as WomanIcon,
} from '@mui/icons-material';

const NumberInput = ({ label, value, onChange, icon }) => (
  <TextField
    type="number"
    label={label}
    value={value}
    onChange={(e) => {
      const parsed = parseInt(e.target.value || '0', 10);
      const safeValue = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
      onChange(safeValue);
    }}
    fullWidth
    inputProps={{ min: 0 }}
    InputProps={{
      startAdornment: icon ? (
        <InputAdornment position="start">
          {icon}
        </InputAdornment>
      ) : null,
    }}
  />
);

const SatisfactionEntry = ({ entry, onChange, onRemove }) => (
  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
    <FormControl fullWidth>
      <InputLabel>Kön</InputLabel>
      <Select
        label="Kön"
        value={entry.gender}
        onChange={(e) => onChange({ ...entry, gender: e.target.value })}
      >
        {GENDER_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2">Nöjdhet</Typography>
      <Rating
        value={entry.rating}
        max={SATISFACTION_MAX}
        onChange={(_, newValue) => onChange({ ...entry, rating: newValue || SATISFACTION_MIN })}
      />
    </Stack>
    <IconButton onClick={onRemove} color="error">
      <DeleteIcon />
    </IconButton>
  </Stack>
);

const ResponsiveRegistration = () => {
  const { msalInstance, user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [homes, setHomes] = useState([]);
  const [activities, setActivities] = useState([]);
  const [companions, setCompanions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [formData, setFormData] = useState({
    home_id: '',
    department_id: '',
    date: toISODateString(new Date()),
    visit_type: VISIT_TYPES.GROUP,
    offer_status: OFFER_STATUS.ACCEPTED,
    gender_counts: makeEmptyGenderCounts(),
    activity_id: '',
    activity_name: '',
    companion_id: '',
    companion_name: '',
    duration_minutes: 30,
    satisfaction_entries: [],
  });
  const [individualGender, setIndividualGender] = useState('men');

  useEffect(() => {
    const fetchData = async () => {
      if (!msalInstance || !user) return;
      setLoading(true);
      try {
        const [homesRes, activitiesRes, companionsRes] = await Promise.all([
          getHomes(msalInstance, user.account),
          getActivities(msalInstance, user.account),
          getCompanions(msalInstance, user.account),
        ]);
        setHomes(homesRes.data || []);
        setActivities(activitiesRes.data || []);
        setCompanions(companionsRes.data || []);
        if ((homesRes.data || []).length > 0) {
          setFormData((prev) => ({ ...prev, home_id: homesRes.data[0].id }));
        }
      } catch (err) {
        setError('Kunde inte ladda data.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [msalInstance, user]);

  const selectedHome = useMemo(() => homes.find((h) => h.id === formData.home_id), [homes, formData.home_id]);
  const availableDepartments = useMemo(
    () => (selectedHome?.departments || []).filter((dept) => dept.active !== false),
    [selectedHome]
  );

  useEffect(() => {
    if (!availableDepartments.length) {
      setFormData((prev) => ({ ...prev, department_id: '' }));
    } else if (!availableDepartments.find((dept) => dept.id === formData.department_id)) {
      setFormData((prev) => ({ ...prev, department_id: availableDepartments[0].id }));
    }
  }, [availableDepartments, formData.department_id]);

  const activityOptions = useMemo(() => (activities || []).map((a) => ({ id: a.id, name: a.name })), [activities]);
  const companionOptions = useMemo(() => (companions || []).map((c) => ({ id: c.id, name: c.name })), [companions]);

  const totalParticipants = useMemo(() => {
    const counts = ensureGenderCounts(formData.gender_counts);
    return counts.men + counts.women;
  }, [formData.gender_counts]);

  useEffect(() => {
    if (formData.visit_type === VISIT_TYPES.INDIVIDUAL) {
      setFormData((prev) => ({
        ...prev,
        gender_counts:
          individualGender === 'men'
            ? { men: 1, women: 0 }
            : { men: 0, women: 1 },
        satisfaction_entries: prev.satisfaction_entries.slice(0, 1),
      }));
    }
  }, [formData.visit_type, individualGender]);

  const handleGenderCountChange = (gender, value) => {
    setFormData((prev) => ({
      ...prev,
      gender_counts: { ...prev.gender_counts, [gender]: value },
    }));
  };

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleOfferStatusChange = (value) => {
    if (value === OFFER_STATUS.DECLINED) {
      setFormData((prev) => ({
        ...prev,
        offer_status: value,
        activity_id: '',
        activity_name: '',
        companion_id: '',
        companion_name: '',
        duration_minutes: null,
        satisfaction_entries: [],
        gender_counts: ensureGenderCounts({ men: 0, women: 0 }),
      }));
    } else {
      setFormData((prev) => ({ ...prev, offer_status: value, duration_minutes: prev.duration_minutes || 30 }));
    }
  };

  const maxSatisfactionEntries = totalParticipants;
  const canAddSatisfaction = formData.offer_status === OFFER_STATUS.ACCEPTED && formData.satisfaction_entries.length < maxSatisfactionEntries;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.home_id || !formData.department_id) {
      setError('Välj äldreboende och avdelning.');
      return;
    }
    if (totalParticipants === 0 && formData.offer_status !== OFFER_STATUS.DECLINED) {
      setError('Minst en deltagare krävs.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        ...formData,
        gender_counts: ensureGenderCounts(formData.gender_counts),
        duration_minutes:
          formData.offer_status === OFFER_STATUS.ACCEPTED && formData.duration_minutes
            ? Number(formData.duration_minutes)
            : null,
        satisfaction_entries:
          formData.offer_status === OFFER_STATUS.ACCEPTED
            ? formData.satisfaction_entries.map((entry) => ({ gender: entry.gender, rating: entry.rating }))
            : [],
      };
      await registerVisit(msalInstance, user.account, payload);
      setSuccess('Registreringen sparades.');
      setFormData({
        ...formData,
        date: toISODateString(new Date()),
        gender_counts: makeEmptyGenderCounts(),
        activity_id: '',
        activity_name: '',
        companion_id: '',
        companion_name: '',
        duration_minutes: 30,
        satisfaction_entries: [],
        offer_status: OFFER_STATUS.ACCEPTED,
        visit_type: VISIT_TYPES.GROUP,
      });
      setIndividualGender('men');
    } catch (err) {
      setError('Kunde inte spara registreringen.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant={isMobile ? 'h4' : 'h3'} align="center" sx={{ mb: 4, fontWeight: 700 }}>
        Registrera utevistelse
      </Typography>
      <form onSubmit={handleSubmit}>
        <Stack spacing={3}>
          {(error || success) && (
            <Alert severity={error ? 'error' : 'success'} onClose={() => { setError(null); setSuccess(null); }}>
              {error || success}
            </Alert>
          )}

          <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, border: 1, borderColor: 'divider' }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth required>
                  <InputLabel>Äldreboende</InputLabel>
                  <Select
                    label="Äldreboende"
                    value={formData.home_id}
                    onChange={(e) => handleFieldChange('home_id', e.target.value)}
                  >
                    {homes.map((home) => (
                      <MenuItem key={home.id} value={home.id}>
                        {home.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth required>
                  <InputLabel>Avdelning</InputLabel>
                  <Select
                    label="Avdelning"
                    value={formData.department_id}
                    onChange={(e) => handleFieldChange('department_id', e.target.value)}
                    disabled={!availableDepartments.length}
                  >
                    {availableDepartments.map((dept) => (
                      <MenuItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Datum"
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleFieldChange('date', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <CalendarIcon />
                      </InputAdornment>
                    ),
                  }}
                  required
                />
              </Grid>
            </Grid>
          </Paper>

          <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, border: 1, borderColor: 'divider' }}>
            <Stack spacing={2}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>Typ av registrering</Typography>
              <RadioGroup
                row
                value={formData.visit_type}
                onChange={(e) => handleFieldChange('visit_type', e.target.value)}
              >
                <FormControlLabel value={VISIT_TYPES.GROUP} control={<Radio />} label="Grupp" />
                <FormControlLabel value={VISIT_TYPES.INDIVIDUAL} control={<Radio />} label="Enskild" />
              </RadioGroup>

              {formData.visit_type === VISIT_TYPES.GROUP ? (
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <NumberInput
                      label="Antal män"
                      value={formData.gender_counts.men}
                      onChange={(val) => handleGenderCountChange('men', val)}
                      icon={<ManIcon />}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <NumberInput
                      label="Antal kvinnor"
                      value={formData.gender_counts.women}
                      onChange={(val) => handleGenderCountChange('women', val)}
                      icon={<WomanIcon />}
                    />
                  </Grid>
                </Grid>
              ) : (
                <Box>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>Välj kön</Typography>
                  <RadioGroup
                    row
                    value={individualGender}
                    onChange={(e) => setIndividualGender(e.target.value)}
                  >
                    {GENDER_OPTIONS.map((option) => (
                      <FormControlLabel
                        key={option.value}
                        value={option.value}
                        control={<Radio />}
                        label={option.label}
                      />
                    ))}
                  </RadioGroup>
                </Box>
              )}
              <Chip icon={<GroupIcon />} label={`Totalt antal deltagare: ${totalParticipants}`} color="primary" variant="outlined" />
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, border: 1, borderColor: 'divider' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Svar på erbjudandet</Typography>
            <RadioGroup
              row
              value={formData.offer_status}
              onChange={(e) => handleOfferStatusChange(e.target.value)}
            >
              <FormControlLabel value={OFFER_STATUS.ACCEPTED} control={<Radio />} label="Tackade ja" />
              <FormControlLabel value={OFFER_STATUS.DECLINED} control={<Radio />} label="Tackade nej" />
            </RadioGroup>
          </Paper>

          {formData.offer_status === OFFER_STATUS.ACCEPTED && (
            <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, border: 1, borderColor: 'divider' }}>
              <Stack spacing={3}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Genomförd utevistelse</Typography>
                <Autocomplete
                  options={activityOptions}
                  getOptionLabel={(option) => option?.name || ''}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  value={activityOptions.find((option) => option.id === formData.activity_id) || null}
                  onChange={(_, newValue) =>
                    setFormData((prev) => ({
                      ...prev,
                      activity_id: newValue?.id || '',
                      activity_name: newValue?.name || '',
                    }))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Aktivitet"
                      required
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
                />

                <Autocomplete
                  options={companionOptions}
                  getOptionLabel={(option) => option?.name || ''}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  value={companionOptions.find((option) => option.id === formData.companion_id) || null}
                  onChange={(_, newValue) =>
                    setFormData((prev) => ({
                      ...prev,
                      companion_id: newValue?.id || '',
                      companion_name: newValue?.name || '',
                    }))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Med vem"
                      required
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: (
                          <>
                            <InputAdornment position="start">
                              <PersonIcon color="primary" />
                            </InputAdornment>
                            {params.InputProps.startAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                />

                <TextField
                  type="number"
                  label="Varaktighet (minuter)"
                  value={formData.duration_minutes ?? ''}
                  required
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value || '1', 10);
                    const safeValue = Number.isNaN(parsed) ? 1 : Math.max(1, parsed);
                    handleFieldChange('duration_minutes', safeValue);
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AccessTimeIcon />
                      </InputAdornment>
                    ),
                    inputProps: { min: 1, max: 720 },
                  }}
                />

                <Divider />
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Nöjdhet (valfritt)</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Lägg till en rad per deltagare som lämnat en bedömning.
                    </Typography>
                  </Stack>
                  {formData.satisfaction_entries.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Ingen nöjdhet registrerad än.
                    </Typography>
                  )}
                  <Stack spacing={2}>
                    {formData.satisfaction_entries.map((entry, index) => (
                      <SatisfactionEntry
                        key={`${entry.gender}-${index}`}
                        entry={entry}
                        onChange={(updated) => {
                          setFormData((prev) => ({
                            ...prev,
                            satisfaction_entries: prev.satisfaction_entries.map((item, i) => (i === index ? updated : item)),
                          }));
                        }}
                        onRemove={() => {
                          setFormData((prev) => ({
                            ...prev,
                            satisfaction_entries: prev.satisfaction_entries.filter((_, i) => i !== index),
                          }));
                        }}
                        disableRemove={formData.satisfaction_entries.length === 0}
                      />
                    ))}
                  </Stack>
                  <Button disabled={!canAddSatisfaction} onClick={() => {
                    if (!canAddSatisfaction) return;
                    setFormData((prev) => ({
                      ...prev,
                      satisfaction_entries: [
                        ...prev.satisfaction_entries,
                        { gender: 'men', rating: SATISFACTION_MAX },
                      ],
                    }));
                  }}>
                    Lägg till nöjdhet
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          )}

          <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
            <CardContent>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={3}
                alignItems={{ md: 'center' }}
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="subtitle1" color="text.secondary">
                    Sammanfattning
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {totalParticipants} deltagare
                  </Typography>
                </Box>
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={submitting}
                >
                  {submitting ? 'Registrerar...' : 'Registrera'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </form>
    </Box>
  );
};

export default ResponsiveRegistration;
