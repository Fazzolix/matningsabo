import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getStatistics, getTraffpunkter, getActivities } from '../services/statisticsService';
import { toISODateString } from '../utils/dateHelpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList, AreaChart, Area } from 'recharts';
import { FaUsers, FaChartBar, FaVenusMars, FaPercentage, FaCalendarAlt } from 'react-icons/fa';
import { FormControl, InputLabel, Select, MenuItem, Checkbox, ListItemText, OutlinedInput, Button } from '@mui/material';
import './Dashboard.css';
import { PARTICIPANT_KEYS, PARTICIPANT_LABELS } from '../config/participants';

const StatCard = ({ icon, title, value, color }) => (
    <div className="stat-card" style={{ borderLeftColor: color }}>
        <div className="stat-card-icon" style={{ backgroundColor: color }}>{icon}</div>
        <div className="stat-card-info">
            <span className="stat-card-title">{title}</span>
            <span className="stat-card-value">{value}</span>
        </div>
    </div>
);

const Dashboard = () => {
    const { msalInstance, user } = useAuth();
    const [stats, setStats] = useState([]);
    const [traffpunkter, setTraffpunkter] = useState([]);
    const [activities, setActivities] = useState([]);
    const [filters, setFilters] = useState({
        traffpunkt_id: '',
        from: toISODateString(new Date(new Date().setMonth(new Date().getMonth() - 1))),
        to: toISODateString(new Date()),
        selectedActivities: [],
        time_block: '', // '', 'fm', 'em', 'kv'
    });
    const [loading, setLoading] = useState(true);
    const [showAllPopular, setShowAllPopular] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!msalInstance || !user) return;
            setLoading(true);
            setError(null);
            try {
                const [statsRes, traffpunkterRes, activitiesRes] = await Promise.all([
                    getStatistics(msalInstance, user.account, { from: filters.from, to: filters.to, traffpunkt_id: filters.traffpunkt_id }),
                    getTraffpunkter(msalInstance, user.account),
                    getActivities(msalInstance, user.account),
                ]);
                setStats(statsRes.data);
                setTraffpunkter(traffpunkterRes.data);
                setActivities(activitiesRes.data);
            } catch (err) {
                setError('Kunde inte ladda dashboard-data.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [msalInstance, user, filters.from, filters.to, filters.traffpunkt_id]);

    const filteredStats = useMemo(() => {
        let s = stats;
        if (filters.selectedActivities.length > 0) {
            s = s.filter(stat => filters.selectedActivities.includes(stat.activity));
        }
        if (filters.time_block) {
            s = s.filter(stat => stat.time_block === filters.time_block);
        }
        return s;
    }, [stats, filters.selectedActivities, filters.time_block]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };
    
    const handleActivityFilterChange = (event) => {
        const {
          target: { value },
        } = event;
        setFilters(prev => ({
            ...prev,
            selectedActivities: typeof value === 'string' ? value.split(',') : value,
        }));
      };

    const { kpi, genderData, visitorTypeData, popularActivitiesAll, dailySeries } = useMemo(() => {
        if (filteredStats.length === 0) {
            // Build empty series for the range so the chart doesn't look broken
            const series = [];
            try {
                const start = new Date(filters.from);
                const end = new Date(filters.to);
                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    const iso = d.toISOString().split('T')[0];
                    series.push({ date: iso, visitors: 0 });
                }
            } catch (e) {
                // Fallback: leave empty on invalid dates
            }
            return { kpi: { total: 0, avg: '0.0', unique: 0, occurrences: 0 }, genderData: [], visitorTypeData: [], popularActivitiesAll: [], dailySeries: series };
        }

        const total = filteredStats.reduce((sum, item) => sum + item.total_participants, 0);
        const men = filteredStats.reduce((sum, item) => sum + Object.values(item.participants).reduce((s, p) => s + p.men, 0), 0);
        const women = filteredStats.reduce((sum, item) => sum + Object.values(item.participants).reduce((s, p) => s + p.women, 0), 0);
        
        // Summera per deltagartyp dynamiskt (bakåtkompatibel: saknade fält räknas som 0)
        const totalsByKey = PARTICIPANT_KEYS.reduce((acc, key) => {
            const t = filteredStats.reduce((sum, item) => {
                const v = (item.participants && item.participants[key]) || { men: 0, women: 0 };
                return sum + (v.men || 0) + (v.women || 0);
            }, 0);
            acc[key] = t;
            return acc;
        }, {});

        const activityCounts = filteredStats.reduce((acc, item) => {
            acc[item.activity] = (acc[item.activity] || 0) + item.total_participants;
            return acc;
        }, {});

        const occurrences = filteredStats.length;

        // Aggregate totals per day
        const byDate = filteredStats.reduce((acc, item) => {
            const d = item.date;
            acc[d] = (acc[d] || 0) + (item.total_participants || 0);
            return acc;
        }, {});

        // Generate a continuous date range from filters.from to filters.to and fill zeros
        const series = [];
        try {
            const start = new Date(filters.from);
            const end = new Date(filters.to);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const iso = d.toISOString().split('T')[0];
                series.push({ date: iso, visitors: byDate[iso] || 0 });
            }
        } catch (e) {
            // If date parse fails, fallback to keys present in byDate
            Object.keys(byDate).sort().forEach(k => series.push({ date: k, visitors: byDate[k] }));
        }
        return {
            kpi: {
                total,
                avg: (occurrences > 0 ? (total / occurrences) : 0).toFixed(1),
                unique: Object.keys(activityCounts).length,
                occurrences,
            },
            genderData: [{ name: 'Män', value: men }, { name: 'Kvinnor', value: women }],
            visitorTypeData: PARTICIPANT_KEYS.map(k => ({ name: PARTICIPANT_LABELS[k], value: totalsByKey[k] })),
            popularActivitiesAll: Object.entries(activityCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            dailySeries: series,
        };
    }, [filteredStats, filters.from, filters.to]);

    const COLORS = ['#831f82', '#a94aa8', '#5c1659', '#c77dce'];
    const VISITOR_COLORS = {
        'Äldreboende': '#831f82',      // boende
        'Trygghetsboende': '#a94aa8',  // trygghetsboende
        'Externa': '#5c1659',          // externa
        'Nya': '#28a745',              // nya (grön)
    };

    if (loading) return <div className="loading-message">Laddar dashboard...</div>;
    if (error) return <div className="error-message">{error}</div>;

    return (
        <div className="dashboard-layout">
            <div className="filters-card card">
                <div className="filter-item">
                    <FormControl fullWidth>
                        <InputLabel>Träffpunkt</InputLabel>
                        <Select name="traffpunkt_id" value={filters.traffpunkt_id} label="Träffpunkt" onChange={handleFilterChange}>
                            <MenuItem value=""><em>Alla Träffpunkter</em></MenuItem>
                            {traffpunkter.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                </div>
                <div className="filter-item">
                    <FormControl fullWidth>
                        <InputLabel>Aktiviteter</InputLabel>
                        <Select
                            multiple
                            name="selectedActivities"
                            value={filters.selectedActivities}
                            onChange={handleActivityFilterChange}
                            input={<OutlinedInput label="Aktiviteter" />}
                            renderValue={(selected) => selected.join(', ')}
                        >
                            {activities.map((activity) => (
                                <MenuItem key={activity.id} value={activity.name}>
                                    <Checkbox checked={filters.selectedActivities.indexOf(activity.name) > -1} />
                                    <ListItemText primary={activity.name} />
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </div>
                <div className="filter-item">
                    <FormControl fullWidth>
                        <InputLabel>Tid på dagen</InputLabel>
                        <Select name="time_block" value={filters.time_block} label="Tid på dagen" onChange={handleFilterChange}>
                            <MenuItem value=""><em>Alla tider</em></MenuItem>
                            <MenuItem value="fm">Förmiddag</MenuItem>
                            <MenuItem value="em">Eftermiddag</MenuItem>
                            <MenuItem value="kv">Kväll</MenuItem>
                        </Select>
                    </FormControl>
                </div>
                <div className="filter-item date-filter">
                    <label>Från</label>
                    <input type="date" name="from" value={filters.from} onChange={handleFilterChange} />
                </div>
                <div className="filter-item date-filter">
                    <label>Till</label>
                    <input type="date" name="to" value={filters.to} onChange={handleFilterChange} />
                </div>
            </div>

            <div className="kpi-grid">
                <StatCard icon={<FaUsers />} title="Totalt antal besökare" value={kpi.total} color="#831f82" />
                <StatCard icon={<FaChartBar />} title="Unika aktiviteter" value={kpi.unique} color="#007bff" />
                <StatCard icon={<FaCalendarAlt />} title="Antal aktiviteter" value={kpi.occurrences} color="#17a2b8" />
                <StatCard icon={<FaPercentage />} title="Besökare per aktivitet" value={kpi.avg} color="#28a745" />
            </div>

            <div className="charts-grid">
                <div className="chart-card card">
                    <h3>Könsfördelning</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie data={genderData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                                {genderData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="chart-card card">
                    <h3>Besökstyper</h3>
                     <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie data={visitorTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} label>
                                {visitorTypeData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={VISITOR_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="chart-card card full-width">
                    <div className="chart-card-header">
                        <h3>Populäraste aktiviteterna</h3>
                        <Button size="small" variant="outlined" onClick={() => setShowAllPopular(v => !v)}>
                            {showAllPopular ? 'Visa färre' : 'Visa fler'}
                        </Button>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={(showAllPopular ? popularActivitiesAll.slice(0, 10) : popularActivitiesAll.slice(0, 5))} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis type="category" dataKey="name" interval={0} width={showAllPopular ? 180 : 150} />
                            <Tooltip />
                            <Bar dataKey="value" fill="var(--primary-purple)" name="Antal besökare">
                                <LabelList dataKey="value" position="right" />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="chart-card card full-width">
                    <h3>Besökare över tid</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={dailySeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="visitorsGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.8} />
                                    <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0.1} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" minTickGap={20} tickFormatter={(d) => (d ? d.slice(5) : d)} />
                            <YAxis />
                            <Tooltip formatter={(v) => [v, 'Besökare']} labelFormatter={(l) => `Datum: ${l}`} />
                            <Area type="monotone" dataKey="visitors" name="Besökare" stroke={COLORS[0]} fillOpacity={1} fill="url(#visitorsGradient)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
