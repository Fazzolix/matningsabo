import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { listMyVisits, getVisit, updateVisit, deleteVisit } from '../services/myAttendanceService';
import { getHomes, getActivities, getCompanions } from '../services/statisticsService';
import { toISODateString } from '../utils/dateHelpers';
import {
  ensureGenderCounts,
  makeEmptyGenderCounts,
  GENDER_OPTIONS,
  OFFER_STATUS,
  VISIT_TYPES,
  SATISFACTION_MAX,
  SATISFACTION_MIN,
} from '../config/participants';
import {
  Box, Card, CardContent, Typography, Button, IconButton, Stack, Alert,
  CircularProgress, List, ListItem, ListItemText, Divider, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, FormControl, InputLabel, Select,
  MenuItem, RadioGroup, FormControlLabel, Radio, InputAdornment, Autocomplete,
  Rating
} from '@mui/material';
import {
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  Event as EventIcon,
  LocationOn as LocationIcon,
  CalendarToday as CalendarIcon,
  Delete as DeleteIcon,
  Save as SaveIcon
} from '@mui/icons-material';

const StepperInput = ({ label, value, onChange, min = 0, max = 1000, step = 1 }) => {
  const safeValue = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  const handleChange = (delta) => {
    const next = Math.min(max, Math.max(min, safeValue + delta));
    onChange(next);
  };
  return (
    <Stack spacing={0.5}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{label}</Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1.5,
          px: 1,
          py: 0.5,
          backgroundColor: 'background.paper',
        }}
      >
        <IconButton
          aria-label={`Minska ${label}`}
          onClick={() => handleChange(-step)}
          disabled={safeValue <= min}
          sx={{ border: 1, borderColor: 'divider', mr: 1 }}
        >
          -
        </IconButton>
        <Typography
          component="span"
          sx={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: '1.1rem' }}
        >
          {safeValue}
        </Typography>
        <IconButton
          aria-label={`Öka ${label}`}
          onClick={() => handleChange(step)}
          disabled={safeValue >= max}
          sx={{ border: 1, borderColor: 'divider', ml: 1 }}
        >
          +
        </IconButton>
      </Box>
    </Stack>
  );
};

const startOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // start Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
};

const endOfWeek = (start) => {
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  d.setHours(23,59,59,999);
  return d;
};

const MyRegistrations = () => {
  const { msalInstance, user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null); // full doc
  const [saving, setSaving] = useState(false);

  const [homes, setHomes] = useState([]);
  const [activities, setActivities] = useState([]);
  const [companions, setCompanions] = useState([]);
  const [individualGender, setIndividualGender] = useState('men');

  const weekRange = useMemo(() => {
    const today = new Date();
    const base = startOfWeek(new Date(today.getFullYear(), today.getMonth(), today.getDate() + weekOffset * 7));
    const start = toISODateString(base);
    const end = toISODateString(endOfWeek(base));
    return { from: start, to: end, base };
  }, [weekOffset]);

  const editingHome = useMemo(() => {
    if (!editing) return null;
    return homes.find((t) => t.id === editing.home_id) || null;
  }, [editing, homes]);

  const editingDepartments = useMemo(() => {
    if (!editingHome) return [];
    return editingHome.departments || [];
  }, [editingHome]);

  const editingTotalParticipants = editing ? (ensureGenderCounts(editing.gender_counts).men + ensureGenderCounts(editing.gender_counts).women) : 0;

  const canAddEditingSatisfaction = editing && editing.offer_status === OFFER_STATUS.ACCEPTED && editing.satisfaction_entries.length < editingTotalParticipants;

  const fetchLists = async () => {
    if (!msalInstance || !user) return;
    try {
    const [tRes, aRes, cRes] = await Promise.all([
      getHomes(msalInstance, user.account),
      getActivities(msalInstance, user.account),
      getCompanions(msalInstance, user.account),
    ]);
    setHomes(tRes.data || []);
    setActivities(aRes.data || []);
    setCompanions(cRes.data || []);
    } catch (e) {
      // Non-blocking; editor can still show current values
      console.warn('Failed loading lists', e);
    }
  };

  const fetchWeek = async () => {
    if (!msalInstance || !user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listMyVisits(msalInstance, user.account, { from: weekRange.from, to: weekRange.to });
      setItems(res.data || []);
    } catch (e) {
      setError('Kunde inte hämta registreringar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msalInstance, user, weekRange.from, weekRange.to]);

  useEffect(() => {
    fetchLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msalInstance, user]);

  const openEditor = async (id) => {
    if (!msalInstance || !user) return;
    setError(null);
    try {
      const res = await getVisit(msalInstance, user.account, id);
      const doc = res.data || {};
      const genderCounts = doc.gender_counts
        ? ensureGenderCounts(doc.gender_counts)
        : (() => {
            let men = 0;
            let women = 0;
            Object.values(doc.participants || {}).forEach((entry) => {
              if (!entry) return;
              men += Number(entry.men) || 0;
              women += Number(entry.women) || 0;
            });
            return ensureGenderCounts({ men, women });
          })();
      const satisfactionEntries = (doc.satisfaction_entries || []).map((entry) => ({
        gender: entry.gender,
        rating: entry.rating,
      }));
      if (doc.visit_type === VISIT_TYPES.INDIVIDUAL) {
        if (genderCounts.women === 1) {
          setIndividualGender('women');
        } else {
          setIndividualGender('men');
        }
      }
      setEditing({
        ...doc,
        gender_counts: genderCounts,
        satisfaction_entries: satisfactionEntries,
        activity_id: doc.activity_id || '',
        activity_name: doc.activity || doc.activity_name || '',
        companion_id: doc.companion_id || '',
        companion_name: doc.companion || doc.companion_name || '',
        offer_status: doc.offer_status || OFFER_STATUS.ACCEPTED,
        visit_type: doc.visit_type || VISIT_TYPES.GROUP,
      });
      setEditorOpen(true);
    } catch (e) {
      setError('Kunde inte öppna registreringen');
    }
  };

  const handleSave = async () => {
    if (!msalInstance || !user || !editing) return;
    setSaving(true);
    setError(null);
    try {
      const parsedDuration = Number.isFinite(editing.duration_minutes) ? editing.duration_minutes : 30;
      const safeDuration = Number.isFinite(parsedDuration) && parsedDuration > 0 ? Math.round(parsedDuration) : 30;
      const payload = {
        ...editing,
        gender_counts: ensureGenderCounts(editing.gender_counts),
        satisfaction_entries:
          editing.offer_status === OFFER_STATUS.ACCEPTED
            ? editing.satisfaction_entries.map((entry) => ({ gender: entry.gender, rating: entry.rating }))
            : [],
        duration_minutes:
          editing.offer_status === OFFER_STATUS.ACCEPTED
            ? safeDuration
            : null,
      };
      await updateVisit(msalInstance, user.account, editing.id, payload);
      setEditorOpen(false);
      setEditing(null);
      await fetchWeek();
    } catch (e) {
      setError('Kunde inte spara ändringar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!msalInstance || !user || !editing) return;
    if (!window.confirm('Är du säker på att du vill ta bort registreringen?')) return;
    setSaving(true);
    setError(null);
    try {
      await deleteVisit(msalInstance, user.account, editing.id);
      setEditorOpen(false);
      setEditing(null);
      await fetchWeek();
    } catch (e) {
      setError('Kunde inte ta bort registreringen');
    } finally {
      setSaving(false);
    }
  };

  const handleEditingFieldChange = (field, value) => {
    setEditing((prev) => {
      if (!prev) return prev;
      if (field === 'offer_status' && value === OFFER_STATUS.DECLINED) {
        return {
          ...prev,
          offer_status: value,
          activity_id: '',
          activity_name: '',
          companion_id: '',
          companion_name: '',
          duration_minutes: null,
          satisfaction_entries: [],
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const handleEditingGenderChange = (gender, value) => {
    const numericValue = Number.isNaN(value) ? 0 : value;
    setEditing((prev) => {
      if (!prev) return prev;
      const counts = ensureGenderCounts(prev.gender_counts);
      return {
        ...prev,
        gender_counts: { ...counts, [gender]: Math.max(0, numericValue) },
      };
    });
  };

  const handleVisitTypeChange = (value) => {
    setEditing((prev) => {
      if (!prev) return prev;
      if (value === VISIT_TYPES.INDIVIDUAL) {
        const genderCounts = individualGender === 'women' ? { men: 0, women: 1 } : { men: 1, women: 0 };
        return { ...prev, visit_type: value, gender_counts: genderCounts };
      }
      return { ...prev, visit_type: value };
    });
  };

  const handleIndividualGenderSelect = (gender) => {
    setIndividualGender(gender);
    setEditing((prev) => {
      if (!prev || prev.visit_type !== VISIT_TYPES.INDIVIDUAL) return prev;
      return {
        ...prev,
        gender_counts: gender === 'women' ? { men: 0, women: 1 } : { men: 1, women: 0 },
      };
    });
  };

  const handleAddEditingSatisfaction = () => {
    if (!canAddEditingSatisfaction) return;
    setEditing((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        satisfaction_entries: [
          ...(prev.satisfaction_entries || []),
          { gender: 'men', rating: SATISFACTION_MAX },
        ],
      };
    });
  };

  const handleUpdateSatisfaction = (index, entry) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const entries = prev.satisfaction_entries || [];
      return {
        ...prev,
        satisfaction_entries: entries.map((item, i) => (i === index ? entry : item)),
      };
    });
  };

  const handleRemoveSatisfaction = (index) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const entries = prev.satisfaction_entries || [];
      return {
        ...prev,
        satisfaction_entries: entries.filter((_, i) => i !== index),
      };
    });
  };

  const getHomeName = (id) => (homes.find(t => t.id === id)?.name || id);
  const getDepartmentName = (homeId, departmentId) => {
    const home = homes.find(t => t.id === homeId);
    if (!home) return departmentId || '-';
    const dept = (home.departments || []).find((d) => d.id === departmentId);
    return dept?.name || departmentId || '-';
  };

  return (
    <Box sx={{ maxWidth: { xs: '100%', md: 900 }, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 3, fontWeight: 600, textAlign: 'center' }}>
        Mina utevistelser
      </Typography>

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: 2 }}>
            <IconButton onClick={() => setWeekOffset(weekOffset - 1)} aria-label="Föregående vecka"><PrevIcon /></IconButton>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {weekRange.from} – {weekRange.to}
            </Typography>
            <IconButton onClick={() => setWeekOffset(weekOffset + 1)} aria-label="Nästa vecka"><NextIcon /></IconButton>
            {weekOffset !== 0 && (
              <Button size="small" onClick={() => setWeekOffset(0)}>Idag</Button>
            )}
          </Stack>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <>
              {items.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                  Inga registreringar under vald vecka.
                </Typography>
              )}
              {items.length > 0 && (
                <List>
                  {items.map((it, idx) => (
                    <React.Fragment key={it.id}>
                      <ListItem disablePadding>
                        <ListItem button onClick={() => openEditor(it.id)}>
                          <ListItemText
                            primary={`${it.date} • ${it.activity || (it.offer_status === OFFER_STATUS.ACCEPTED ? 'Ingen aktivitet' : 'Ej genomförd')}`}
                            secondary={`Äldreboende: ${getHomeName(it.home_id)} • Avdelning: ${getDepartmentName(it.home_id, it.department_id)} • ${it.total_participants ?? 0} deltagare • ${(it.offer_status || OFFER_STATUS.ACCEPTED) === OFFER_STATUS.ACCEPTED ? 'Tackade ja' : 'Tackade nej'}`}
                          />
                        </ListItem>
                      </ListItem>
                      {idx < items.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onClose={() => setEditorOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Redigera registrering</DialogTitle>
        <DialogContent dividers>
          {editing ? (
            <Stack spacing={3}>
              <TextField
                label="Äldreboende"
                value={getHomeName(editing.home_id)}
                InputProps={{ readOnly: true, startAdornment: (<InputAdornment position="start"><LocationIcon /></InputAdornment>) }}
                fullWidth
              />

              <FormControl fullWidth>
                <InputLabel>Avdelning</InputLabel>
                <Select
                  label="Avdelning"
                  value={editing.department_id || ''}
                  onChange={(e) => handleEditingFieldChange('department_id', e.target.value)}
                >
                  {editingDepartments.map((dept) => (
                    <MenuItem key={dept.id} value={dept.id}>{dept.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                type="date"
                label="Datum"
                value={editing.date}
                onChange={(e) => handleEditingFieldChange('date', e.target.value)}
                InputLabelProps={{ shrink: true }}
                InputProps={{ startAdornment: (<InputAdornment position="start"><CalendarIcon /></InputAdornment>) }}
                fullWidth
              />

              <FormControl>
                <RadioGroup row value={editing.visit_type} onChange={(e) => handleVisitTypeChange(e.target.value)}>
                  <FormControlLabel value={VISIT_TYPES.GROUP} control={<Radio />} label="Grupp" />
                  <FormControlLabel value={VISIT_TYPES.INDIVIDUAL} control={<Radio />} label="Enskild" />
                </RadioGroup>
              </FormControl>

              {editing.visit_type === VISIT_TYPES.GROUP ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <StepperInput
                    label="Antal män"
                    value={ensureGenderCounts(editing.gender_counts).men}
                    onChange={(val) => handleEditingGenderChange('men', val)}
                    min={0}
                    max={1000}
                  />
                  <StepperInput
                    label="Antal kvinnor"
                    value={ensureGenderCounts(editing.gender_counts).women}
                    onChange={(val) => handleEditingGenderChange('women', val)}
                    min={0}
                    max={1000}
                  />
                </Stack>
              ) : (
                <RadioGroup row value={individualGender} onChange={(e) => handleIndividualGenderSelect(e.target.value)}>
                  {GENDER_OPTIONS.map((option) => (
                    <FormControlLabel key={option.value} value={option.value} control={<Radio />} label={option.label} />
                  ))}
                </RadioGroup>
              )}

              <FormControl>
                <RadioGroup row value={editing.offer_status} onChange={(e) => handleEditingFieldChange('offer_status', e.target.value)}>
                  <FormControlLabel value={OFFER_STATUS.ACCEPTED} control={<Radio />} label="Tackade ja" />
                  <FormControlLabel value={OFFER_STATUS.DECLINED} control={<Radio />} label="Tackade nej" />
                </RadioGroup>
              </FormControl>

              {editing.offer_status === OFFER_STATUS.ACCEPTED && (
                <Stack spacing={2}>
                  <Autocomplete
                    options={activities}
                    getOptionLabel={(option) => option?.name || ''}
                    value={activities.find((a) => a.id === editing.activity_id) || null}
                    onChange={(_, newValue) => {
                      setEditing((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          activity_id: newValue?.id || '',
                          activity_name: newValue?.name || '',
                        };
                      });
                    }}
                    renderInput={(params) => <TextField {...params} label="Aktivitet" required />}
                  />

                  <Autocomplete
                    options={companions}
                    getOptionLabel={(option) => option?.name || ''}
                    value={companions.find((c) => c.id === editing.companion_id) || null}
                    onChange={(_, newValue) => {
                      setEditing((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          companion_id: newValue?.id || '',
                          companion_name: newValue?.name || '',
                        };
                      });
                    }}
                    renderInput={(params) => <TextField {...params} label="Med vem" required />}
                  />

                  <StepperInput
                    label="Varaktighet (minuter)"
                    value={editing.duration_minutes ?? 30}
                    onChange={(val) => handleEditingFieldChange('duration_minutes', val)}
                    min={1}
                    max={720}
                    step={5}
                  />

                  <Divider />
                  <Stack spacing={1}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Nöjdhet</Typography>
                    {(editing.satisfaction_entries || []).map((entry, index) => (
                      <Stack key={`${entry.gender}-${index}`} direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                        <FormControl fullWidth>
                          <InputLabel>Kön</InputLabel>
                          <Select
                            label="Kön"
                            value={entry.gender}
                            onChange={(e) => handleUpdateSatisfaction(index, { ...entry, gender: e.target.value })}
                          >
                            {GENDER_OPTIONS.map((option) => (
                              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Rating
                          value={entry.rating}
                          max={SATISFACTION_MAX}
                          onChange={(_, newValue) => handleUpdateSatisfaction(index, { ...entry, rating: newValue || SATISFACTION_MIN })}
                        />
                        <IconButton color="error" onClick={() => handleRemoveSatisfaction(index)}>
                          <DeleteIcon />
                        </IconButton>
                      </Stack>
                    ))}
                    <Button onClick={handleAddEditingSatisfaction} disabled={!canAddEditingSatisfaction}>
                      Lägg till nöjdhet
                    </Button>
                  </Stack>
                </Stack>
              )}
            </Stack>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress /></Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button color="error" startIcon={<DeleteIcon />} onClick={handleDelete} disabled={saving}>Ta bort</Button>
          <Button onClick={() => setEditorOpen(false)} disabled={saving}>Avbryt</Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving}>Spara</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MyRegistrations;
