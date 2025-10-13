import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { listMyAttendance, getAttendance, updateAttendance, deleteAttendance } from '../services/myAttendanceService';
import { getTraffpunkter, getActivities } from '../services/statisticsService';
import { toISODateString } from '../utils/dateHelpers';
import { PARTICIPANT_KEYS, PARTICIPANT_LABELS, ensureParticipantsShape } from '../config/participants';
import {
  Box, Card, CardContent, Typography, Button, IconButton, Stack, Alert,
  CircularProgress, List, ListItem, ListItemText, Divider, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, FormControl, InputLabel, Select,
  MenuItem, RadioGroup, FormControlLabel, Radio, InputAdornment
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

  const [traffpunkter, setTraffpunkter] = useState([]);
  const [activities, setActivities] = useState([]);

  const weekRange = useMemo(() => {
    const today = new Date();
    const base = startOfWeek(new Date(today.getFullYear(), today.getMonth(), today.getDate() + weekOffset * 7));
    const start = toISODateString(base);
    const end = toISODateString(endOfWeek(base));
    return { from: start, to: end, base };
  }, [weekOffset]);

  const fetchLists = async () => {
    if (!msalInstance || !user) return;
    try {
      const [tRes, aRes] = await Promise.all([
        getTraffpunkter(msalInstance, user.account),
        getActivities(msalInstance, user.account)
      ]);
      setTraffpunkter(tRes.data || []);
      setActivities(aRes.data || []);
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
      const res = await listMyAttendance(msalInstance, user.account, { from: weekRange.from, to: weekRange.to });
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
      const res = await getAttendance(msalInstance, user.account, id);
      const doc = res.data || {};
      const participants = ensureParticipantsShape(doc.participants);
      setEditing({ ...doc, participants });
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
      await updateAttendance(msalInstance, user.account, editing.id, editing);
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
      await deleteAttendance(msalInstance, user.account, editing.id);
      setEditorOpen(false);
      setEditing(null);
      await fetchWeek();
    } catch (e) {
      setError('Kunde inte ta bort registreringen');
    } finally {
      setSaving(false);
    }
  };

  const getTraffName = (id) => (traffpunkter.find(t => t.id === id)?.name || id);

  return (
    <Box sx={{ maxWidth: { xs: '100%', md: 900 }, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 3, fontWeight: 600, textAlign: 'center' }}>
        Mina registreringar
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
                            primary={`${it.date} • ${it.time_block?.toUpperCase()} • ${it.activity}`}
                            secondary={`Träffpunkt: ${getTraffName(it.traffpunkt_id)} • Totalt: ${it.total_participants ?? 0}`}
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
            <Stack spacing={2}>
              <FormControl fullWidth>
                <InputLabel id="traff-label">Träffpunkt</InputLabel>
                <Select
                  labelId="traff-label"
                  label="Träffpunkt"
                  value={editing.traffpunkt_id}
                  onChange={(e) => setEditing({ ...editing, traffpunkt_id: e.target.value })}
                  startAdornment={<InputAdornment position="start"><LocationIcon /></InputAdornment>}
                >
                  {traffpunkter.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                </Select>
              </FormControl>

              <TextField
                type="date"
                label="Datum"
                value={editing.date}
                onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                InputLabelProps={{ shrink: true }}
                InputProps={{ startAdornment: (<InputAdornment position="start"><CalendarIcon /></InputAdornment>) }}
                fullWidth
              />

              <FormControl>
                <RadioGroup row value={editing.time_block} onChange={(e) => setEditing({ ...editing, time_block: e.target.value })}>
                  <FormControlLabel value="fm" control={<Radio />} label="Förmiddag" />
                  <FormControlLabel value="em" control={<Radio />} label="Eftermiddag" />
                  <FormControlLabel value="kv" control={<Radio />} label="Kväll" />
                </RadioGroup>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel id="activity-label">Aktivitet</InputLabel>
                <Select
                  labelId="activity-label"
                  label="Aktivitet"
                  value={editing.activity}
                  onChange={(e) => setEditing({ ...editing, activity: e.target.value })}
                  startAdornment={<InputAdornment position="start"><EventIcon /></InputAdornment>}
                >
                  {activities.map(a => <MenuItem key={a.id} value={a.name}>{a.name}</MenuItem>)}
                </Select>
              </FormControl>

              {/* Participants simple editor */}
              {PARTICIPANT_KEYS.map(cat => (
                <Box key={cat} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>{PARTICIPANT_LABELS[cat]}</Typography>
                  <Stack direction="row" spacing={2}>
                    <TextField type="number" label="Män" inputProps={{ min:0 }} value={editing.participants?.[cat]?.men ?? 0}
                      onChange={(e) => setEditing({ ...editing, participants: { ...editing.participants, [cat]: { ...editing.participants?.[cat], men: Math.max(0, parseInt(e.target.value||'0',10)) } } })} />
                    <TextField type="number" label="Kvinnor" inputProps={{ min:0 }} value={editing.participants?.[cat]?.women ?? 0}
                      onChange={(e) => setEditing({ ...editing, participants: { ...editing.participants, [cat]: { ...editing.participants?.[cat], women: Math.max(0, parseInt(e.target.value||'0',10)) } } })} />
                  </Stack>
                </Box>
              ))}
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
