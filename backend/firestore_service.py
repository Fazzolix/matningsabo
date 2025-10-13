from google.cloud import firestore
from google.api_core.exceptions import FailedPrecondition
import re
from typing import Optional, List, Dict
from datetime import datetime

class FirestoreService:
    def __init__(self):
        self.db = firestore.Client()

    # ---- Collections for users and audit (top-level) ----
    def users_collection(self):
        # Top-level collection for this app's users
        return self.db.collection('Users_traffpunkt')

    def audit_collection(self):
        # Top-level collection for admin role audit events
        return self.db.collection('Admin_audit_traffpunkt')

    def get_all_traffpunkter(self):
        traffpunkter_ref = self.db.collection('traffpunkter').where('active', '==', True).order_by('name')
        return [doc.to_dict() for doc in traffpunkter_ref.stream()]

    def get_all_activities(self):
        activities_ref = self.db.collection('activities').where('active', '==', True).order_by('sort_order')
        return [doc.to_dict() for doc in activities_ref.stream()]

    def get_activity(self, activity_id: str):
        if not activity_id:
            return None
        ref = self.db.collection('activities').document(activity_id)
        snap = ref.get()
        return snap.to_dict() if snap.exists else None

    def find_activity_by_name(self, name: str):
        if not name:
            return None
        q = self.db.collection('activities').where('name', '==', name).limit(1)
        docs = list(q.stream())
        return docs[0].to_dict() if docs else None

    def add_attendance_record(self, data):
        attendance_ref = self.db.collection('attendance_records').document()
        data['id'] = attendance_ref.id
        attendance_ref.set(data)
        return attendance_ref.id

    def get_statistics(self, traffpunkt_id=None, date_from=None, date_to=None):
        """
        Fetch statistics, preferring server-side filtering. If Firestore requires
        a composite index for (traffpunkt_id + date range), gracefully fall back
        to querying by traffpunkt_id only and filter dates in memory.
        """
        base = self.db.collection('attendance_records')

        # Build the primary query
        query = base
        if traffpunkt_id:
            query = query.where('traffpunkt_id', '==', traffpunkt_id)
        if date_from:
            query = query.where('date', '>=', date_from)
        if date_to:
            query = query.where('date', '<=', date_to)

        try:
            return [doc.to_dict() for doc in query.stream()]
        except FailedPrecondition as e:
            # Missing composite index (common for equality + range filters)
            if 'The query requires an index' in str(e) and traffpunkt_id and (date_from or date_to):
                # Fallback: fetch by traffpunkt_id only, then filter by date bounds locally
                docs = base.where('traffpunkt_id', '==', traffpunkt_id).stream()
                results = []
                for doc in docs:
                    data = doc.to_dict()
                    d = data.get('date')
                    if date_from and (d is None or d < date_from):
                        continue
                    if date_to and (d is None or d > date_to):
                        continue
                    results.append(data)
                return results
            # Propagate other errors
            raise

    def add_activity_if_not_exists(self, activity_name):
        """Adds an activity to the collection if it doesn't already exist."""
        if not activity_name:
            return

        # Skapa säkert ID - endast alfanumeriska tecken och bindestreck
        activity_id = re.sub(r'[^a-z0-9-]', '', activity_name.lower().replace(' ', '-'))
        activity_ref = self.db.collection('activities').document(activity_id)

        if not activity_ref.get().exists:
            # Get the current max sort_order to place the new one at the end
            max_sort_order_query = self.db.collection('activities').order_by('sort_order', direction=firestore.Query.DESCENDING).limit(1)
            docs = list(max_sort_order_query.stream())
            max_sort_order = 0
            if docs:
                max_sort_order = docs[0].to_dict().get('sort_order', 0)

            activity_ref.set({
                'id': activity_id,
                'name': activity_name,
                'active': True,
                'category': 'allman', # General category for auto-added activities
                'sort_order': max_sort_order + 1
            })

    def add_activity(self, data):
        name = data.get('name')
        # Skapa säkert ID - endast alfanumeriska tecken och bindestreck
        activity_id = re.sub(r'[^a-z0-9-]', '', name.lower().replace(' ', '-'))
        
        activity_ref = self.db.collection('activities').document(activity_id)

        @firestore.transactional
        def _add_activity_transaction(transaction, ref, doc_data):
            snapshot = ref.get(transaction=transaction)
            if snapshot.exists:
                return None  # Indicate that it already exists
            transaction.set(ref, doc_data)
            return doc_data['id']

        # Get the current max sort_order to place the new one at the end
        max_sort_order_query = self.db.collection('activities').order_by('sort_order', direction=firestore.Query.DESCENDING).limit(1)
        docs = list(max_sort_order_query.stream())
        max_sort_order = 0
        if docs:
            max_sort_order = docs[0].to_dict().get('sort_order', 0)

        doc_data = {
            'id': activity_id,
            'name': name,
            'active': data.get('active', True),
            'description': data.get('description', ''),
            'category': data.get('category', 'allman'),
            'sort_order': max_sort_order + 1,
            'created_at': firestore.SERVER_TIMESTAMP
        }
        
        transaction = self.db.transaction()
        result = _add_activity_transaction(transaction, activity_ref, doc_data)
        
        return result

    def update_activity_name(self, activity_id: str, new_name: str, old_name: str) -> bool:
        """Update the display name of an activity and rename historical records to keep filters cohesive."""
        if not activity_id or not new_name:
            return False
        activities_ref = self.db.collection('activities').document(activity_id)
        # Update the activity document's name only (keep id stable)
        activities_ref.set({'name': new_name}, merge=True)

        # Rename attendance records that used the old name
        if old_name and old_name != new_name:
            base = self.db.collection('attendance_records')
            q = base.where('activity', '==', old_name)
            batch = self.db.batch()
            count = 0
            for doc in q.stream():
                batch.update(doc.reference, {'activity': new_name})
                count += 1
                if count % 400 == 0:  # stay under 500 ops per batch
                    batch.commit()
                    batch = self.db.batch()
            # commit remainder
            batch.commit()
        return True

    def deactivate_activity(self, activity_id: str) -> bool:
        if not activity_id:
            return False
        ref = self.db.collection('activities').document(activity_id)
        snap = ref.get()
        if not snap.exists:
            return False
        ref.set({'active': False}, merge=True)
        return True

    # ---- Attendance listing and updates ----
    def list_my_attendance(self, oid: str, email: Optional[str], date_from: Optional[str], date_to: Optional[str], limit: int = 500) -> List[Dict]:
        base = self.db.collection('attendance_records')
        results: List[Dict] = []

        def q_stream_by_oid():
            q = base.where('registered_by_oid', '==', oid)
            if date_from:
                q = q.where('date', '>=', date_from)
            if date_to:
                q = q.where('date', '<=', date_to)
            return list(q.stream())

        try:
            docs = q_stream_by_oid()
            results.extend([d.to_dict() for d in docs])
        except FailedPrecondition as e:
            if 'The query requires an index' in str(e):
                # Fallback: fetch by OID only then filter by date bounds
                docs = base.where('registered_by_oid', '==', oid).stream()
                for d in docs:
                    data = d.to_dict()
                    dd = data.get('date')
                    if date_from and (dd is None or dd < date_from):
                        continue
                    if date_to and (dd is None or dd > date_to):
                        continue
                    results.append(data)
            else:
                raise

        # Fallback for legacy records without OID: match by email if provided
        if email:
            try:
                q = base.where('registered_by', '==', email)
                if date_from:
                    q = q.where('date', '>=', date_from)
                if date_to:
                    q = q.where('date', '<=', date_to)
                docs2 = list(q.stream())
                for d in docs2:
                    data = d.to_dict()
                    # De-dupe by id
                    if not any(r.get('id') == data.get('id') for r in results):
                        results.append(data)
            except FailedPrecondition as e:
                if 'The query requires an index' in str(e):
                    # Fallback: fetch by email only and filter by date
                    docs2 = base.where('registered_by', '==', email).stream()
                    for d in docs2:
                        data = d.to_dict()
                        dd = data.get('date')
                        if date_from and (dd is None or dd < date_from):
                            continue
                        if date_to and (dd is None or dd > date_to):
                            continue
                        if not any(r.get('id') == data.get('id') for r in results):
                            results.append(data)
                else:
                    raise

        # Sort by date desc then registered_at desc
        results.sort(key=lambda x: (x.get('date') or '', x.get('registered_at') or datetime.min), reverse=True)
        return results[:limit]

    def get_attendance(self, doc_id: str) -> Optional[Dict]:
        ref = self.db.collection('attendance_records').document(doc_id)
        snap = ref.get()
        return snap.to_dict() if snap.exists else None

    def update_attendance(self, doc_id: str, new_data: Dict) -> Optional[Dict]:
        ref = self.db.collection('attendance_records').document(doc_id)

        @firestore.transactional
        def _tx(transaction):
            snap = ref.get(transaction=transaction)
            if not snap.exists:
                return None
            current = snap.to_dict()
            edit_count = int(current.get('edit_count', 0)) + 1
            new_data2 = {**new_data, 'edit_count': edit_count, 'last_modified_at': firestore.SERVER_TIMESTAMP}
            transaction.set(ref, new_data2, merge=False)
            return new_data2

        tx = self.db.transaction()
        return _tx(tx)

    def delete_attendance(self, doc_id: str) -> bool:
        ref = self.db.collection('attendance_records').document(doc_id)
        snap = ref.get()
        if not snap.exists:
            return False
        ref.delete()
        return True

    def attendance_audit_collection(self):
        return self.db.collection('Attendance_audit_traffpunkt')

    def write_attendance_audit(self, action: str, actor_oid: str, actor_email: str, attendance_id: str, changed_fields: Optional[List[str]] = None):
        self.attendance_audit_collection().document().set({
            'action': action,
            'actor_oid': actor_oid,
            'actor_email': (actor_email or '').lower(),
            'attendance_id': attendance_id,
            'changed_fields': changed_fields or [],
            'ts': firestore.SERVER_TIMESTAMP,
        })

    # ---- Users and roles (under traffpunkter/__meta__) ----
    def upsert_user(self, oid: str, email: str, display_name: str) -> None:
        if not oid:
            return
        email_l = (email or '').strip().lower()
        doc_ref = self.users_collection().document(oid)
        doc = doc_ref.get()
        data = {
            'email': email_l,
            'display_name': display_name or '',
            'last_login_at': firestore.SERVER_TIMESTAMP,
        }
        if not doc.exists:
            data.update({
                'roles': {'admin': False},
                'created_at': firestore.SERVER_TIMESTAMP,
                'id': oid,
            })
        doc_ref.set(data, merge=True)

    def get_user(self, oid: str) -> Optional[Dict]:
        if not oid:
            return None
        doc = self.users_collection().document(oid).get()
        if not doc.exists:
            return None
        return doc.to_dict()

    def list_users(self, q: Optional[str] = None, limit: int = 200) -> List[Dict]:
        # Basic listing; Firestore lacks substring queries without extra indexes/fields, so filter client-side.
        limit = max(1, min(limit, 500))
        users_ref = self.users_collection()
        docs = list(users_ref.limit(limit).stream())
        users = [d.to_dict() for d in docs]
        q_l = (q or '').strip().lower()
        if q_l:
            users = [u for u in users if q_l in (u.get('email') or '').lower()]
        # Sort by created_at if present, otherwise email
        users.sort(key=lambda u: (u.get('created_at') is None, u.get('created_at'), u.get('email')))
        return users

    def set_admin_role(self, target_oid: str, admin: bool, actor_oid: str, actor_email: str) -> Dict:
        user_ref = self.users_collection().document(target_oid)
        snap = user_ref.get()
        if not snap.exists:
            raise KeyError('user_not_found')
        user_ref.set({'roles': {'admin': bool(admin)}}, merge=True)
        # Audit log
        self.audit_collection().document().set({
            'action': 'grant_admin' if admin else 'revoke_admin',
            'actor_oid': actor_oid,
            'actor_email': (actor_email or '').lower(),
            'target_oid': target_oid,
            'target_email': (snap.to_dict().get('email') or '').lower(),
            'ts': firestore.SERVER_TIMESTAMP,
        })
        updated = user_ref.get().to_dict()
        return {'id': target_oid, 'roles': updated.get('roles', {'admin': False})}

    def add_traffpunkt(self, data):
        name = data.get('name')
        # Create a URL-friendly ID from the name - säker generering
        traffpunkt_id = name.lower().replace(' ', '-').replace('å', 'a').replace('ä', 'a').replace('ö', 'o')
        # Ta bort alla tecken som inte är alfanumeriska eller bindestreck
        traffpunkt_id = re.sub(r'[^a-z0-9-]', '', traffpunkt_id)
        
        traffpunkt_ref = self.db.collection('traffpunkter').document(traffpunkt_id)

        @firestore.transactional
        def _add_traffpunkt_transaction(transaction, ref, doc_data):
            snapshot = ref.get(transaction=transaction)
            if snapshot.exists:
                return None  # Indicate that it already exists
            transaction.set(ref, doc_data)
            return doc_data['id']

        doc_data = {
            'id': traffpunkt_id,
            'name': name,
            'active': data.get('active', True),
            'address': data.get('address', ''),
            'description': data.get('description', ''),
            'created_at': firestore.SERVER_TIMESTAMP
        }
        
        transaction = self.db.transaction()
        result = _add_traffpunkt_transaction(transaction, traffpunkt_ref, doc_data)
        
        return result
