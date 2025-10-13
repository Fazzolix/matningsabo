import React, { useState, useEffect } from 'react';
import './Registration.css';
import { useNavigate } from 'react-router-dom';

const Registration = () => {
    const [traffpunkt, setTraffpunkt] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [timeOfDay, setTimeOfDay] = useState('');
    const [activity, setActivity] = useState('');
    const [isInternal, setIsInternal] = useState(false);
    const [isNew, setIsNew] = useState(false);
    const [isExternal, setIsExternal] = useState(false);
    const [message, setMessage] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour >= 8 && hour < 12) {
            setTimeOfDay('fm');
        } else if (hour >= 12 && hour < 16) {
            setTimeOfDay('em');
        } else {
            setTimeOfDay('');
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const registrationData = {
            traffpunkt,
            date,
            timeOfDay,
            activity,
            isInternal,
            isNew,
            isExternal,
        };

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(registrationData),
            });

            if (response.ok) {
                setMessage('Registreringen lyckades!');
                // Reset form
                setTraffpunkt('');
                setActivity('');
                setIsInternal(false);
                setIsNew(false);
                setIsExternal(false);
            } else {
                const errorData = await response.json();
                setMessage(`Fel vid registrering: ${errorData.message}`);
            }
        } catch (error) {
            setMessage(`Nätverksfel: ${error.message}`);
        }
    };

    return (
        <div className="registration-container">
            <h2>Registrera närvaro</h2>
            <form onSubmit={handleSubmit}>
                <div className="registration-top-row">
                    <div className="form-group">
                        <label>Träffpunkt:</label>
                        <select value={traffpunkt} onChange={(e) => setTraffpunkt(e.target.value)} required>
                            <option value="">Välj träffpunkt</option>
                            <option value="Skovde">Skovde</option>
                            <option value="Falkoping">Falköping</option>
                            <option value="Hjo">Hjo</option>
                            <option value="Tibro">Tibro</option>
                            <option value="Karlsborg">Karlsborg</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Datum:</label>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>Tid på dagen:</label>
                        <select value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} required>
                            <option value="">Välj tid</option>
                            <option value="fm">Förmiddag</option>
                            <option value="em">Eftermiddag</option>
                        </select>
                    </div>
                </div>

                <div className="activity-row">
                    <div className="form-group">
                        <label>Aktivitet:</label>
                        <input type="text" value={activity} onChange={(e) => setActivity(e.target.value)} />
                    </div>
                </div>

                <div className="checkbox-row">
                    <div className="checkbox-group">
                        <label>
                            <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                            Boende
                        </label>
                        <label>
                            <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} />
                            Ny
                        </label>
                        <label>
                            <input type="checkbox" checked={isExternal} onChange={(e) => setIsExternal(e.target.checked)} />
                            Extern
                        </label>
                    </div>
                </div>

                <button type="submit">Registrera</button>
            </form>
            {message && <p>{message}</p>}
            <button onClick={() => navigate('/dashboard')}>Gå till Dashboard</button>
        </div>
    );
};

export default Registration;
