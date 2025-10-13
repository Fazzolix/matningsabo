import re
from datetime import datetime

def validate_traffpunkt_id(traffpunkt_id):
    """Validera träffpunkt ID"""
    if not traffpunkt_id or not isinstance(traffpunkt_id, str):
        return False, "Träffpunkt ID saknas"
    
    # Endast alfanumeriska tecken och bindestreck, max 50 tecken
    if not re.match(r'^[a-z0-9-]{1,50}$', traffpunkt_id):
        return False, "Ogiltigt träffpunkt ID format"
    
    return True, None

def validate_date(date_str):
    """Validera datumformat"""
    if not date_str:
        return False, "Datum saknas"
    
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return True, None
    except ValueError:
        return False, "Ogiltigt datumformat (använd YYYY-MM-DD)"

def validate_time_block(time_block):
    """Validera tidsblock"""
    valid_blocks = ['fm', 'em', 'kv']  # fm=förmiddag, em=eftermiddag, kv=kväll
    if time_block not in valid_blocks:
        return False, f"Ogiltigt tidsblock. Måste vara en av: {', '.join(valid_blocks)}"
    return True, None

def validate_activity(activity):
    """Validera aktivitet"""
    if not activity or not isinstance(activity, str):
        return False, "Aktivitet saknas"
    
    # Max 100 tecken, inga specialtecken
    if len(activity) > 100:
        return False, "Aktivitetsnamn för långt (max 100 tecken)"
    
    if not re.match(r'^[a-zA-ZåäöÅÄÖ0-9\s\-\_]+$', activity):
        return False, "Ogiltiga tecken i aktivitetsnamn"
    
    return True, None

def validate_participants(participants):
    """Validera deltagardata"""
    if not isinstance(participants, dict):
        return False, "Deltagardata måste vara ett objekt"

    # Tillåtna och obligatoriska kategorier
    allowed_categories = ['boende', 'externa', 'nya', 'trygghetsboende']
    required_categories = ['boende', 'externa', 'nya']  # trygghetsboende är valfri

    # Okända kategorier ska inte accepteras
    for category in participants.keys():
        if category not in allowed_categories:
            return False, f"Okänd kategori '{category}'"

    # Kontrollera obligatoriska kategorier och att de är objekt
    for category in required_categories:
        if category not in participants:
            return False, f"Kategori '{category}' saknas"
        if not isinstance(participants[category], dict):
            return False, f"Kategori '{category}' måste vara ett objekt"

    # Validera numeriska värden för de kategorier som finns
    for category, values in participants.items():
        if not isinstance(values, dict):
            return False, f"Kategori '{category}' måste vara ett objekt"
        for gender in ['men', 'women']:
            if gender in values:
                value = values[gender]
                if not isinstance(value, int) or value < 0 or value > 1000:
                    return False, f"Ogiltigt antal för {category}.{gender} (måste vara 0-1000)"

    return True, None

def validate_attendance_data(data):
    """Validera all närvarodata"""
    errors = []
    
    # Validera träffpunkt
    valid, error = validate_traffpunkt_id(data.get('traffpunkt_id'))
    if not valid:
        errors.append(error)
    
    # Validera datum
    valid, error = validate_date(data.get('date'))
    if not valid:
        errors.append(error)
    
    # Validera tidsblock
    valid, error = validate_time_block(data.get('time_block'))
    if not valid:
        errors.append(error)
    
    # Validera aktivitet
    valid, error = validate_activity(data.get('activity'))
    if not valid:
        errors.append(error)
    
    # Validera deltagare
    valid, error = validate_participants(data.get('participants', {}))
    if not valid:
        errors.append(error)
    
    return len(errors) == 0, errors

def sanitize_string(value, max_length=100):
    """Sanitera sträng för säker lagring"""
    if not value:
        return ""
    
    # Ta bort farliga tecken
    value = re.sub(r'[<>&\'"\\]', '', str(value))
    
    # Begränsa längd
    return value[:max_length].strip()
