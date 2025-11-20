import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getStatistics, getHomes, getActivities, getCompanions } from '../services/statisticsService';
import { toISODateString } from '../utils/dateHelpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList, AreaChart, Area } from 'recharts';
import { FaUsers, FaChartBar, FaPercentage, FaCalendarAlt } from 'react-icons/fa';
import { FormControl, InputLabel, Select, MenuItem, Checkbox, ListItemText, OutlinedInput, Button, Stack } from '@mui/material';
import './Dashboard.css';
import { OFFER_STATUS, VISIT_TYPES, ensureGenderCounts } from '../config/participants';

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
    const [homes, setHomes] = useState([]);
    const [activities, setActivities] = useState([]);
    const [companions, setCompanions] = useState([]);
    const [filters, setFilters] = useState({
        // Äldreboende-filter (backend-filter)
        home_id: '',
        department_id: '',
        // Datumintervall (backend-filter)
        from: toISODateString(new Date(new Date().setMonth(new Date().getMonth() - 1))),
        to: toISODateString(new Date()),
        // Aktiviteter (frontend-filter)
        selectedActivities: [],
        selectedCompanions: [],
        // Tidsblock (frontend-filter) – '', 'fm', 'em', 'kv'
        offer_status: '',
        visit_type: '',
        // Könsfilter (frontend-filter)
        gender: '',
    });
    const [loading, setLoading] = useState(true);
    const [showAllPopular, setShowAllPopular] = useState(false);
    const [showAllPopularAvg, setShowAllPopularAvg] = useState(false);
    const [error, setError] = useState(null);
    const [timelineMode, setTimelineMode] = useState('offered');

    useEffect(() => {
        const fetchData = async () => {
            if (!msalInstance || !user) return;
            setLoading(true);
            setError(null);
            try {
                const [statsRes, homesRes, activitiesRes, companionsRes] = await Promise.all([
                    getStatistics(msalInstance, user.account, {
                        from: filters.from,
                        to: filters.to,
                        home_id: filters.home_id,
                        department_id: filters.department_id,
                        offer_status: filters.offer_status,
                        visit_type: filters.visit_type,
                    }),
                    getHomes(msalInstance, user.account),
                    getActivities(msalInstance, user.account),
                    getCompanions(msalInstance, user.account),
                ]);
                setStats(statsRes.data);
                setHomes(homesRes.data);
                setActivities(activitiesRes.data);
                setCompanions(companionsRes.data);
            } catch (err) {
                setError('Kunde inte ladda dashboard-data.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [msalInstance, user, filters.from, filters.to, filters.home_id, filters.department_id, filters.offer_status, filters.visit_type]);

    const filteredStats = useMemo(() => {
        let s = stats;
        if (filters.selectedActivities.length > 0) {
            s = s.filter(stat => filters.selectedActivities.includes(stat.activity));
        }
        if (filters.selectedCompanions.length > 0) {
            s = s.filter(stat => filters.selectedCompanions.includes(stat.companion));
        }
        return s;
    }, [stats, filters.selectedActivities, filters.selectedCompanions]);

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

    const selectedHome = useMemo(() => homes.find(t => t.id === filters.home_id) || null, [homes, filters.home_id]);
    const availableDepartments = useMemo(() => selectedHome ? (selectedHome.departments || []) : [], [selectedHome]);

    const resolveDepartmentName = useCallback((deptId) => {
        if (!deptId) return 'Övrigt';
        for (const home of homes) {
            const match = (home.departments || []).find((dept) => dept.id === deptId);
            if (match) return match.name;
        }
        return deptId;
    }, [homes]);

    const deriveLegacyGenderCounts = useCallback((participants = {}) => {
        let men = 0;
        let women = 0;
        Object.values(participants).forEach((entry) => {
            if (!entry) return;
            men += Number(entry.men) || 0;
            women += Number(entry.women) || 0;
        });
        return ensureGenderCounts({ men, women });
    }, []);

    useEffect(() => {
        if (!filters.home_id) {
            if (filters.department_id) {
                setFilters(prev => ({ ...prev, department_id: '' }));
            }
            return;
        }
        if (filters.department_id && !availableDepartments.find(dept => dept.id === filters.department_id)) {
            setFilters(prev => ({ ...prev, department_id: '' }));
        }
    }, [filters.home_id, filters.department_id, availableDepartments]);

    const { kpi, outcomeByGender, acceptedGenderPie, satisfactionSeries, popularActivitiesAll, companionStats, departmentStats, dailySeries } = useMemo(() => {
        const genderFilter = filters.gender;
        const offeredTimeline = {};
        const acceptedTimeline = {};
        const activityTotals = {};
        const companionTotals = {};
        const departmentMap = {};
        const outcome = {
            accepted: { men: 0, women: 0 },
            declined: { men: 0, women: 0 },
        };
        const acceptedGender = { men: 0, women: 0 };
        const satisfactionBuckets = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        let offeredTotal = 0;
        let acceptedTotal = 0;
        let durationSum = 0;
        let durationCount = 0;

        filteredStats.forEach((item) => {
            const counts = item.gender_counts
                ? ensureGenderCounts(item.gender_counts)
                : deriveLegacyGenderCounts(item.participants);
            const menRaw = counts.men || 0;
            const womenRaw = counts.women || 0;
            const menValue = genderFilter === 'women' ? 0 : menRaw;
            const womenValue = genderFilter === 'men' ? 0 : womenRaw;
            const totalValue = menValue + womenValue;

            offeredTotal += totalValue;
            const dateKey = item.date;
            if (dateKey) {
                offeredTimeline[dateKey] = (offeredTimeline[dateKey] || 0) + totalValue;
            }

            const deptKey = item.department_id || 'övrigt';
            if (!departmentMap[deptKey]) {
                departmentMap[deptKey] = { offered: 0, accepted: 0 };
            }
            departmentMap[deptKey].offered += totalValue;

            const status = item.offer_status || OFFER_STATUS.ACCEPTED;
            if (status === OFFER_STATUS.ACCEPTED) {
                acceptedTotal += totalValue;
                outcome.accepted.men += menValue;
                outcome.accepted.women += womenValue;
                acceptedGender.men += menValue;
                acceptedGender.women += womenValue;
                departmentMap[deptKey].accepted += totalValue;
                if (dateKey) {
                    acceptedTimeline[dateKey] = (acceptedTimeline[dateKey] || 0) + totalValue;
                }
                const activityName = item.activity || 'Okänd aktivitet';
                activityTotals[activityName] = (activityTotals[activityName] || 0) + totalValue;
                const companionName = item.companion || 'Okänd';
                companionTotals[companionName] = (companionTotals[companionName] || 0) + totalValue;
                if (item.duration_minutes) {
                    durationSum += Number(item.duration_minutes);
                    durationCount += 1;
                }
                (item.satisfaction_entries || []).forEach((entry) => {
                    if (!entry) return;
                    if (genderFilter && entry.gender !== genderFilter) return;
                    const rating = Number(entry.rating) || 0;
                    if (rating >= 1 && rating <= 6) {
                        satisfactionBuckets[rating] = (satisfactionBuckets[rating] || 0) + 1;
                    }
                });
            } else {
                outcome.declined.men += menValue;
                outcome.declined.women += womenValue;
                if (dateKey) {
                    acceptedTimeline[dateKey] = acceptedTimeline[dateKey] || 0;
                }
            }
        });

        const timelineSeries = [];
        try {
            const startDate = new Date(filters.from);
            const endDate = new Date(filters.to);
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const iso = d.toISOString().split('T')[0];
                timelineSeries.push({
                    date: iso,
                    offered: offeredTimeline[iso] || 0,
                    accepted: acceptedTimeline[iso] || 0,
                });
            }
        } catch (e) {
            Object.keys(offeredTimeline).sort().forEach((key) => {
                timelineSeries.push({ date: key, offered: offeredTimeline[key], accepted: acceptedTimeline[key] || 0 });
            });
        }

        if (timelineSeries.length === 0) {
            try {
                const startDate = new Date(filters.from);
                const endDate = new Date(filters.to);
                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                    timelineSeries.push({ date: d.toISOString().split('T')[0], offered: 0, accepted: 0 });
                }
            } catch (e) {
                timelineSeries.push({ date: '-', offered: 0, accepted: 0 });
            }
        }

        const popularActivitiesAllList = Object.entries(activityTotals)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        const companionList = Object.entries(companionTotals)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        const departmentList = Object.entries(departmentMap).map(([id, values]) => ({
            id,
            offered: values.offered,
            accepted: values.accepted,
        }));

        const satisfactionSeries = Object.keys(satisfactionBuckets).map((rating) => ({
            rating,
            value: satisfactionBuckets[rating],
        }));

        const occurrences = filteredStats.length;
        const avgParticipants = occurrences > 0 ? (offeredTotal / occurrences).toFixed(1) : '0.0';
        const avgDuration = durationCount > 0 ? Math.round(durationSum / durationCount) : 0;

        return {
            kpi: {
                offered: offeredTotal,
                accepted: acceptedTotal,
                avgDuration,
                avgParticipants,
            },
            outcomeByGender: [
                { name: 'Tackade ja', men: outcome.accepted.men, women: outcome.accepted.women },
                { name: 'Tackade nej', men: outcome.declined.men, women: outcome.declined.women },
            ],
            acceptedGenderPie: [
                { name: 'Män', value: acceptedGender.men },
                { name: 'Kvinnor', value: acceptedGender.women },
            ],
            satisfactionSeries,
            popularActivitiesAll: popularActivitiesAllList,
            companionStats: companionList,
            departmentStats: departmentList,
            dailySeries: timelineSeries,
        };
    }, [filteredStats, filters.from, filters.to, filters.gender, deriveLegacyGenderCounts]);

    const departmentChartData = useMemo(() => (
        departmentStats.map((item) => ({
            name: resolveDepartmentName(item.id),
            offered: item.offered,
            accepted: item.accepted,
        }))
    ), [departmentStats, resolveDepartmentName]);

    const COLORS = ['#831f82', '#a94aa8', '#5c1659', '#c77dce'];

    if (loading) return <div className="loading-message">Laddar dashboard...</div>;
    if (error) return <div className="error-message">{error}</div>;

    return (
        <div className="dashboard-layout">
            <div className="filters-card card">
                <div className="filter-item">
                    <FormControl fullWidth>
                        <InputLabel>Äldreboende</InputLabel>
                        <Select name="home_id" value={filters.home_id} label="Äldreboende" onChange={handleFilterChange}>
                            <MenuItem value=""><em>Alla äldreboenden</em></MenuItem>
                            {homes.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                </div>
                <div className="filter-item">
                    <FormControl fullWidth>
                        <InputLabel>Avdelning</InputLabel>
                        <Select
                            name="department_id"
                            value={filters.department_id}
                            label="Avdelning"
                            onChange={handleFilterChange}
                            disabled={!filters.home_id}
                        >
                            <MenuItem value=""><em>Alla avdelningar</em></MenuItem>
                            {availableDepartments.map((dept) => (
                                <MenuItem key={dept.id} value={dept.id}>{dept.name}</MenuItem>
                            ))}
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
                        <InputLabel>Med vem</InputLabel>
                        <Select
                            multiple
                            name="selectedCompanions"
                            value={filters.selectedCompanions}
                            onChange={(event) => {
                                const { value } = event.target;
                                setFilters((prev) => ({
                                    ...prev,
                                    selectedCompanions: typeof value === 'string' ? value.split(',') : value,
                                }));
                            }}
                            input={<OutlinedInput label="Med vem" />}
                            renderValue={(selected) => selected.join(', ')}
                        >
                            {companions.map((item) => (
                                <MenuItem key={item.id} value={item.name}>
                                    <Checkbox checked={filters.selectedCompanions.indexOf(item.name) > -1} />
                                    <ListItemText primary={item.name} />
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </div>
                <div className="filter-item">
                    <FormControl fullWidth>
                        <InputLabel>Status</InputLabel>
                        <Select name="offer_status" value={filters.offer_status} label="Status" onChange={handleFilterChange}>
                            <MenuItem value=""><em>Alla</em></MenuItem>
                            <MenuItem value={OFFER_STATUS.ACCEPTED}>Tackade ja</MenuItem>
                            <MenuItem value={OFFER_STATUS.DECLINED}>Tackade nej</MenuItem>
                        </Select>
                    </FormControl>
                </div>
                <div className="filter-item">
                    <FormControl fullWidth>
                        <InputLabel>Typ</InputLabel>
                        <Select name="visit_type" value={filters.visit_type} label="Typ" onChange={handleFilterChange}>
                            <MenuItem value=""><em>Alla</em></MenuItem>
                            <MenuItem value={VISIT_TYPES.GROUP}>Grupp</MenuItem>
                            <MenuItem value={VISIT_TYPES.INDIVIDUAL}>Enskild</MenuItem>
                        </Select>
                    </FormControl>
                </div>
                <div className="filter-item">
                    <FormControl fullWidth>
                        <InputLabel>Kön</InputLabel>
                        <Select name="gender" value={filters.gender} label="Kön" onChange={handleFilterChange}>
                            <MenuItem value=""><em>Alla</em></MenuItem>
                            <MenuItem value="men">Endast män</MenuItem>
                            <MenuItem value="women">Endast kvinnor</MenuItem>
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
                <StatCard icon={<FaUsers />} title="Erbjudna utevistelser" value={kpi.offered} color="#831f82" />
                <StatCard icon={<FaChartBar />} title="Genomförda utevistelser" value={kpi.accepted} color="#007bff" />
                <StatCard icon={<FaCalendarAlt />} title="Genomsnittlig tid" value={`${kpi.avgDuration} min`} color="#17a2b8" />
                <StatCard icon={<FaPercentage />} title="Deltagare per registrering" value={kpi.avgParticipants} color="#28a745" />
            </div>

            <div className="charts-grid">
                <div className="chart-card card">
                    <h3>Utfallet per kön</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={outcomeByGender}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="men" fill={COLORS[0]} name="Män" />
                            <Bar dataKey="women" fill={COLORS[1]} name="Kvinnor" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="chart-card card">
                    <h3>Könsfördelning (genomförda)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie data={acceptedGenderPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                                {acceptedGenderPie.map((entry, index) => <Cell key={`pie-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="chart-card card">
                    <h3>Populäraste aktiviteterna</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={popularActivitiesAll.slice(0, showAllPopular ? popularActivitiesAll.length : 5)} layout="vertical" margin={{ left: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" allowDecimals={false} />
                            <YAxis dataKey="name" type="category" width={140} />
                            <Tooltip />
                            <Bar dataKey="value" fill="var(--primary-purple)" name="Deltagare">
                                <LabelList dataKey="value" position="right" />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    {popularActivitiesAll.length > 5 && (
                        <Button size="small" onClick={() => setShowAllPopular(!showAllPopular)} sx={{ mt: 1 }}>
                            {showAllPopular ? 'Visa färre' : 'Visa alla'}
                        </Button>
                    )}
                </div>
                <div className="chart-card card">
                    <h3>Vanligaste "Med vem"</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={companionStats.slice(0, showAllPopularAvg ? companionStats.length : 5)} layout="vertical" margin={{ left: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" allowDecimals={false} />
                            <YAxis dataKey="name" type="category" width={140} />
                            <Tooltip />
                            <Bar dataKey="value" fill="var(--primary-purple)" name="Deltagare">
                                <LabelList dataKey="value" position="right" />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    {companionStats.length > 5 && (
                        <Button size="small" onClick={() => setShowAllPopularAvg(!showAllPopularAvg)} sx={{ mt: 1 }}>
                            {showAllPopularAvg ? 'Visa färre' : 'Visa alla'}
                        </Button>
                    )}
                </div>
                <div className="chart-card card">
                    <h3>Avdelningar</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={departmentChartData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" interval={0} angle={-30} textAnchor="end" height={80} />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="offered" fill={COLORS[0]} name="Erbjudna" />
                            <Bar dataKey="accepted" fill={COLORS[1]} name="Genomförda" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="chart-card card">
                    <h3>Nöjdhet</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={satisfactionSeries}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="rating" label={{ value: 'Betyg', position: 'insideBottom', offset: -5 }} />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="value" fill="var(--primary-purple)" name="Antal omdömen" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="chart-card card full-width">
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <h3>Utevistelser över tid</h3>
                        <Stack direction="row" spacing={1}>
                            <Button size="small" variant={timelineMode === 'offered' ? 'contained' : 'text'} onClick={() => setTimelineMode('offered')}>
                                Erbjudna
                            </Button>
                            <Button size="small" variant={timelineMode === 'accepted' ? 'contained' : 'text'} onClick={() => setTimelineMode('accepted')}>
                                Genomförda
                            </Button>
                        </Stack>
                    </Stack>
                    <ResponsiveContainer width="100%" height={320}>
                        <AreaChart data={dailySeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="visitorsGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.8} />
                                    <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0.1} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" minTickGap={20} tickFormatter={(d) => (d ? d.slice(5) : d)} />
                            <YAxis allowDecimals={false} />
                            <Tooltip formatter={(v) => [v, timelineMode === 'offered' ? 'Erbjudna' : 'Genomförda']} labelFormatter={(l) => `Datum: ${l}`} />
                            <Area type="monotone" dataKey={timelineMode === 'offered' ? 'offered' : 'accepted'} name="Deltagare" stroke={COLORS[0]} fillOpacity={1} fill="url(#visitorsGradient)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
