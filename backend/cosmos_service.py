import os
import re
from uuid import uuid4
from typing import Optional, List, Dict
from datetime import datetime

from azure.cosmos import CosmosClient, PartitionKey
from azure.cosmos.exceptions import CosmosHttpResponseError, CosmosResourceNotFoundError

MAX_DEPARTMENTS_PER_HOME = 20


def _iso_now() -> str:
    return datetime.utcnow().isoformat()


def _slugify(value: Optional[str]) -> str:
    if not value:
        return ''
    slug = value.strip().lower()
    slug = slug.replace('å', 'a').replace('ä', 'a').replace('ö', 'o')
    slug = slug.replace(' ', '-')
    slug = re.sub(r'[^a-z0-9-]', '', slug)
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug


class CosmosService:
    def __init__(self):
        endpoint = os.getenv('COSMOS_ENDPOINT')
        key = os.getenv('COSMOS_KEY')
        db_name = os.getenv('COSMOS_DATABASE', 'sabo')
        if not endpoint or not key:
            raise RuntimeError('COSMOS_ENDPOINT and COSMOS_KEY must be set')

        self.client = CosmosClient(endpoint, key)

        # Ensure database exists
        try:
            self.db = self.client.create_database_if_not_exists(id=db_name)
        except CosmosHttpResponseError as e:
            raise RuntimeError(f'Failed to ensure Cosmos DB database {db_name}: {e}')

        # Containers and partition keys
        self.c_visits = self._ensure_container(
            os.getenv('COSMOS_CONTAINER_VISITS', 'outdoor_visits'), '/home_id'
        )
        self.c_act = self._ensure_container(
            os.getenv('COSMOS_CONTAINER_ACTIVITIES', 'activities'), '/id'
        )
        self.c_homes = self._ensure_container(
            os.getenv('COSMOS_CONTAINER_HOMES', 'homes'), '/id'
        )
        self.c_comp = self._ensure_container(
            os.getenv('COSMOS_CONTAINER_COMPANIONS', 'companions'), '/id'
        )
        self.c_users = self._ensure_container(
            os.getenv('COSMOS_CONTAINER_USERS', 'users_sabo'), '/id'
        )
        self.c_admin_audit = self._ensure_container(
            os.getenv('COSMOS_CONTAINER_ADMIN_AUDIT', 'admin_audit_sabo'), '/id'
        )
        self.c_visit_audit = self._ensure_container(
            os.getenv('COSMOS_CONTAINER_VISIT_AUDIT', 'visit_audit_sabo'), '/id'
        )

    def _ensure_container(self, container_id: str, partition_path: str):
        try:
            return self.db.create_container_if_not_exists(
                id=container_id,
                partition_key=PartitionKey(path=partition_path)
            )
        except CosmosHttpResponseError as e:
            raise RuntimeError(f'Failed to ensure container {container_id}: {e}')

    # ---- Äldreboenden ----
    def get_all_homes(self) -> List[Dict]:
        query = 'SELECT * FROM c WHERE c.active = true'
        items = list(self.c_homes.query_items(query=query, enable_cross_partition_query=True))
        for item in items:
            departments = item.get('departments') or []
            departments.sort(key=lambda x: (x.get('name') or '').lower())
            item['departments'] = departments
        items.sort(key=lambda x: (x.get('name') or '').lower())
        return items

    def get_home(self, home_id: str) -> Optional[Dict]:
        if not home_id:
            return None
        try:
            doc = self.c_homes.read_item(item=home_id, partition_key=home_id)
            if doc.get('departments'):
                doc['departments'].sort(key=lambda x: (x.get('name') or '').lower())
            return doc
        except CosmosResourceNotFoundError:
            return None

    def add_home(self, data: Dict) -> Optional[str]:
        name = (data.get('name') or '').strip()
        if not name:
            return None
        home_id = _slugify(name)
        if not home_id:
            return None
        try:
            try:
                _ = self.c_homes.read_item(item=home_id, partition_key=home_id)
                return None  # already exists
            except CosmosResourceNotFoundError:
                pass

            doc = {
                'id': home_id,
                'name': name,
                'active': bool(data.get('active', True)),
                'address': data.get('address', ''),
                'description': data.get('description', ''),
                'created_at': _iso_now(),
                'departments': data.get('departments') or [],
            }
            self.c_homes.create_item(doc)
            return home_id
        except CosmosHttpResponseError as e:
            if getattr(e, 'status_code', None) == 409:
                return None
            raise

    # ---- Activities ----
    def get_all_activities(self) -> List[Dict]:
        query = 'SELECT * FROM c WHERE c.active = true'
        items = list(self.c_act.query_items(query=query, enable_cross_partition_query=True))
        # Guard against null/invalid sort_order; push nulls last and normalize to numeric
        items.sort(key=lambda x: (
            x.get('sort_order') is None,
            x.get('sort_order') if isinstance(x.get('sort_order'), (int, float)) else 0
        ))
        return items

    # ---- Companions ----
    def get_all_companions(self) -> List[Dict]:
        query = 'SELECT * FROM c WHERE c.active = true'
        items = list(self.c_comp.query_items(query=query, enable_cross_partition_query=True))
        items.sort(key=lambda x: (x.get('name') or '').lower())
        return items

    def get_companion(self, companion_id: str) -> Optional[Dict]:
        if not companion_id:
            return None
        try:
            return self.c_comp.read_item(item=companion_id, partition_key=companion_id)
        except CosmosResourceNotFoundError:
            return None

    def add_companion(self, data: Dict) -> Optional[str]:
        name = (data.get('name') or '').strip()
        if not name:
            return None
        companion_id = _slugify(name)
        if not companion_id:
            return None
        try:
            try:
                _ = self.c_comp.read_item(item=companion_id, partition_key=companion_id)
                return None
            except CosmosResourceNotFoundError:
                pass
            doc = {
                'id': companion_id,
                'name': name,
                'active': bool(data.get('active', True)),
                'created_at': _iso_now(),
            }
            self.c_comp.create_item(doc)
            return companion_id
        except CosmosHttpResponseError as e:
            if getattr(e, 'status_code', None) == 409:
                return None
            raise

    def update_companion_name(self, companion_id: str, new_name: str) -> bool:
        if not companion_id or not new_name:
            return False
        try:
            doc = self.c_comp.read_item(item=companion_id, partition_key=companion_id)
            doc['name'] = new_name
            self.c_comp.upsert_item(doc)
            return True
        except CosmosResourceNotFoundError:
            return False

    def deactivate_companion(self, companion_id: str) -> bool:
        if not companion_id:
            return False
        try:
            doc = self.c_comp.read_item(item=companion_id, partition_key=companion_id)
            doc['active'] = False
            self.c_comp.upsert_item(doc)
            return True
        except CosmosResourceNotFoundError:
            return False

    # ---- Departments ----
    def add_department(self, home_id: str, name: str) -> Optional[Dict]:
        doc = self.get_home(home_id)
        if not doc:
            raise ValueError('home_not_found')
        departments_value = doc.get('departments')
        departments = departments_value if isinstance(departments_value, list) else []
        if len(departments) >= MAX_DEPARTMENTS_PER_HOME:
            raise ValueError('max_departments')
        slug = _slugify(name)
        if not slug:
            raise ValueError('invalid_department')
        dept_id = f"{home_id}__{slug}"
        if any(dept.get('id') == dept_id for dept in departments):
            return None
        new_dept = {
            'id': dept_id,
            'slug': slug,
            'name': name,
            'active': True,
            'created_at': _iso_now(),
        }
        departments.append(new_dept)
        doc['departments'] = departments
        try:
            # upsert avoids partition_key kw for compatibility and creates if necessary
            self.c_homes.upsert_item(doc)
        except CosmosHttpResponseError as e:
            if getattr(e, 'status_code', None) == 404:
                raise ValueError('home_not_found')
            raise
        return new_dept

    def update_department(self, home_id: str, department_id: str, *, name: Optional[str] = None, active: Optional[bool] = None) -> bool:
        doc = self.get_home(home_id)
        if not doc:
            return False
        updated = False
        for dept in doc.get('departments') or []:
            if dept.get('id') == department_id:
                if name:
                    dept['name'] = name
                if active is not None:
                    dept['active'] = bool(active)
                updated = True
                break
        if not updated:
            return False
        self.c_homes.upsert_item(doc)
        return True

    def remove_department(self, home_id: str, department_id: str) -> bool:
        doc = self.get_home(home_id)
        if not doc:
            return False
        departments = doc.get('departments') or []
        new_departments = [dept for dept in departments if dept.get('id') != department_id]
        if len(new_departments) == len(departments):
            return False
        doc['departments'] = new_departments
        self.c_homes.upsert_item(doc)
        return True

    def get_activity(self, activity_id: str) -> Optional[Dict]:
        if not activity_id:
            return None
        try:
            doc = self.c_act.read_item(item=activity_id, partition_key=activity_id)
            return doc
        except CosmosResourceNotFoundError:
            return None

    def find_activity_by_name(self, name: str) -> Optional[Dict]:
        if not name:
            return None
        q = 'SELECT TOP 1 * FROM c WHERE c.name = @name'
        params = [{'name': '@name', 'value': name}]
        docs = list(self.c_act.query_items(query=q, parameters=params, enable_cross_partition_query=True))
        return docs[0] if docs else None

    def add_activity_if_not_exists(self, activity_name: Optional[str]) -> None:
        if not activity_name:
            return
        activity_id = re.sub(r'[^a-z0-9-]', '', (activity_name or '').lower().replace(' ', '-'))
        try:
            self.c_act.read_item(item=activity_id, partition_key=activity_id)
            return  # already exists
        except CosmosResourceNotFoundError:
            # compute max sort_order
            docs = list(self.c_act.query_items(query='SELECT c.sort_order FROM c', enable_cross_partition_query=True))
            max_sort = 0
            if docs:
                max_sort = max(int(d.get('sort_order') or 0) for d in docs)
            doc = {
                'id': activity_id,
                'name': activity_name,
                'active': True,
                'category': 'allman',
                'sort_order': max_sort + 1,
                'created_at': _iso_now(),
            }
            try:
                self.c_act.create_item(doc)
            except CosmosHttpResponseError as e:
                # Idempotency under concurrency:
                # When multiple requests attempt to auto-create the same activity at the
                # same time (e.g., concurrent /api/visits submissions), Cosmos may
                # return 409 Conflict for the later creates. Treat 409 as "already
                # exists" to match Firestore's upsert-like semantics and avoid 500s.
                code = getattr(e, 'status_code', None)
                if code == 409:
                    return
                # Bubble up other errors
                raise

    def add_activity(self, data: Dict) -> Optional[str]:
        name = (data.get('name') or '').strip()
        if not name:
            return None
        activity_id = re.sub(r'[^a-z0-9-]', '', name.lower().replace(' ', '-'))
        try:
            # return None if exists
            try:
                _ = self.c_act.read_item(item=activity_id, partition_key=activity_id)
                return None
            except CosmosResourceNotFoundError:
                pass

            # compute max sort_order
            docs = list(self.c_act.query_items(query='SELECT c.sort_order FROM c', enable_cross_partition_query=True))
            max_sort = 0
            if docs:
                max_sort = max(int(d.get('sort_order') or 0) for d in docs)

            doc = {
                'id': activity_id,
                'name': name,
                'active': bool(data.get('active', True)),
                'description': data.get('description', ''),
                'category': data.get('category', 'allman'),
                'sort_order': max_sort + 1,
                'created_at': _iso_now(),
            }
            self.c_act.create_item(doc)
            return activity_id
        except CosmosHttpResponseError as e:
            # Only swallow true 409 conflicts as "already exists"; all other
            # errors (throttling, auth, misconfig) are re-raised to surface 5xx.
            if getattr(e, 'status_code', None) == 409:
                return None
            raise

    def update_activity_name(self, activity_id: str, new_name: str, old_name: str) -> bool:
        if not activity_id or not new_name:
            return False
        try:
            doc = self.c_act.read_item(item=activity_id, partition_key=activity_id)
            doc['name'] = new_name
            self.c_act.upsert_item(doc)
        except CosmosResourceNotFoundError:
            return False

        # Update visit records with old name
        if old_name and old_name != new_name:
            q = 'SELECT c.id, c.home_id, c.traffpunkt_id FROM c WHERE c.activity = @old'
            params = [{'name': '@old', 'value': old_name}]
            for item in self.c_visits.query_items(query=q, parameters=params, enable_cross_partition_query=True):
                try:
                    pk = item.get('home_id') or item.get('traffpunkt_id')
                    if not pk:
                        continue
                    full = self.c_visits.read_item(item=item['id'], partition_key=pk)
                    full['activity'] = new_name
                    self.c_visits.upsert_item(full)
                except CosmosHttpResponseError:
                    continue
        return True

    def deactivate_activity(self, activity_id: str) -> bool:
        if not activity_id:
            return False
        try:
            doc = self.c_act.read_item(item=activity_id, partition_key=activity_id)
            doc['active'] = False
            self.c_act.upsert_item(doc)
            return True
        except CosmosResourceNotFoundError:
            return False

    # ---- Outdoor visits ----
    def add_visit(self, data: Dict) -> str:
        d = dict(data)
        if not d.get('id'):
            d['id'] = str(uuid4())
        # ensure timestamps as ISO strings
        ra = d.get('registered_at')
        if not isinstance(ra, str):
            d['registered_at'] = _iso_now()
        lma = d.get('last_modified_at')
        if not isinstance(lma, str):
            d['last_modified_at'] = d['registered_at']
        if 'edit_count' not in d:
            d['edit_count'] = 0
        self.c_visits.create_item(d)
        return d['id']

    def get_statistics(self, home_id: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None,
                       department_id: Optional[str] = None, activity_id: Optional[str] = None, companion_id: Optional[str] = None,
                       offer_status: Optional[str] = None, visit_type: Optional[str] = None) -> List[Dict]:
        # Build SQL query dynamically
        clauses = []
        params = []
        if home_id:
            clauses.append('c.home_id = @home')
            params.append({'name': '@home', 'value': home_id})
        if date_from:
            clauses.append('c.date >= @df')
            params.append({'name': '@df', 'value': date_from})
        if date_to:
            clauses.append('c.date <= @dt')
            params.append({'name': '@dt', 'value': date_to})
        if department_id:
            clauses.append('c.department_id = @dept')
            params.append({'name': '@dept', 'value': department_id})
        if activity_id:
            clauses.append('c.activity_id = @act')
            params.append({'name': '@act', 'value': activity_id})
        if companion_id:
            clauses.append('c.companion_id = @comp')
            params.append({'name': '@comp', 'value': companion_id})
        if offer_status:
            clauses.append('c.offer_status = @status')
            params.append({'name': '@status', 'value': offer_status})
        if visit_type:
            clauses.append('c.visit_type = @vt')
            params.append({'name': '@vt', 'value': visit_type})
        where = (' WHERE ' + ' AND '.join(clauses)) if clauses else ''
        q = f'SELECT * FROM c{where}'
        items = list(self.c_visits.query_items(query=q, parameters=params, enable_cross_partition_query=True))
        return items

    def list_my_visits(self, oid: str, email: Optional[str], date_from: Optional[str], date_to: Optional[str], limit: int = 500) -> List[Dict]:
        clauses = ['c.registered_by_oid = @oid']
        params = [{'name': '@oid', 'value': oid}]
        if date_from:
            clauses.append('c.date >= @df')
            params.append({'name': '@df', 'value': date_from})
        if date_to:
            clauses.append('c.date <= @dt')
            params.append({'name': '@dt', 'value': date_to})
        q = f'SELECT * FROM c WHERE {" AND ".join(clauses)}'
        res = list(self.c_visits.query_items(query=q, parameters=params, enable_cross_partition_query=True))

        # Legacy fallback: records created before OID was stored
        if email:
            clauses_email = ['c.registered_by = @em']
            params_email = [{'name': '@em', 'value': email}]
            if date_from:
                clauses_email.append('c.date >= @df2')
                params_email.append({'name': '@df2', 'value': date_from})
            if date_to:
                clauses_email.append('c.date <= @dt2')
                params_email.append({'name': '@dt2', 'value': date_to})
            q2 = f'SELECT * FROM c WHERE {" AND ".join(clauses_email)}'
            for d in self.c_visits.query_items(query=q2, parameters=params_email, enable_cross_partition_query=True):
                if not any(r.get('id') == d.get('id') for r in res):
                    res.append(d)

        res.sort(key=lambda x: (x.get('date') or '', x.get('registered_at') or ''), reverse=True)
        return res[: max(1, min(limit, 500))]

    def get_visit(self, doc_id: str) -> Optional[Dict]:
        # Unknown partition key: query by id
        q = 'SELECT TOP 1 * FROM c WHERE c.id = @id'
        p = [{'name': '@id', 'value': doc_id}]
        docs = list(self.c_visits.query_items(query=q, parameters=p, enable_cross_partition_query=True))
        return docs[0] if docs else None

    def update_visit(self, doc_id: str, new_data: Dict) -> Optional[Dict]:
        existing = self.get_visit(doc_id)
        if not existing:
            return None
        edit_count = int(existing.get('edit_count', 0)) + 1
        new_data2 = {**new_data, 'edit_count': edit_count, 'last_modified_at': _iso_now()}
        # Preserve immutable/partition fields
        new_data2['id'] = doc_id
        if existing.get('home_id'):
            new_data2['home_id'] = existing['home_id']
        elif existing.get('traffpunkt_id'):
            new_data2['home_id'] = existing['traffpunkt_id']
        # Preserve partition key value with legacy fallback
        pk = existing.get('home_id') or existing.get('traffpunkt_id')
        if not pk:
            return None
        self.c_visits.upsert_item(new_data2)
        return new_data2

    def delete_visit(self, doc_id: str) -> bool:
        existing = self.get_visit(doc_id)
        if not existing:
            return False
        pk = existing.get('home_id') or existing.get('traffpunkt_id')
        if not pk:
            return False
        try:
            self.c_visits.delete_item(item=doc_id, partition_key=pk)
            return True
        except CosmosHttpResponseError:
            return False

    def write_visit_audit(self, action: str, actor_oid: str, actor_email: str, visit_id: str, changed_fields: Optional[List[str]] = None):
        doc = {
            'id': str(uuid4()),
            'action': action,
            'actor_oid': actor_oid,
            'actor_email': (actor_email or '').lower(),
            'visit_id': visit_id,
            'changed_fields': changed_fields or [],
            'ts': _iso_now(),
        }
        self.c_visit_audit.create_item(doc)

    # ---- Users & roles ----
    def upsert_user(self, oid: str, email: str, display_name: str) -> None:
        if not oid:
            return
        email_l = (email or '').strip().lower()
        try:
            user = self.c_users.read_item(item=oid, partition_key=oid)
            # update
            user.update({
                'email': email_l,
                'display_name': display_name or '',
                'last_login_at': _iso_now(),
            })
            self.c_users.upsert_item(user)
        except CosmosResourceNotFoundError:
            doc = {
                'id': oid,
                'email': email_l,
                'display_name': display_name or '',
                'roles': {'admin': False},
                'created_at': _iso_now(),
                'last_login_at': _iso_now(),
            }
            self.c_users.create_item(doc)

    def get_user(self, oid: str) -> Optional[Dict]:
        if not oid:
            return None
        try:
            return self.c_users.read_item(item=oid, partition_key=oid)
        except CosmosResourceNotFoundError:
            return None

    def list_users(self, q: Optional[str] = None, limit: int = 200) -> List[Dict]:
        users = list(self.c_users.read_all_items())
        q_l = (q or '').strip().lower()
        if q_l:
            users = [u for u in users if q_l in (u.get('email') or '').lower()]
        users.sort(key=lambda u: (u.get('created_at') is None, u.get('created_at'), u.get('email')))
        return users[: max(1, min(limit, 500))]

    def set_admin_role(self, target_oid: str, admin: bool, actor_oid: str, actor_email: str) -> Dict:
        try:
            user = self.c_users.read_item(item=target_oid, partition_key=target_oid)
        except CosmosResourceNotFoundError:
            raise KeyError('user_not_found')
        roles = dict(user.get('roles') or {})
        roles['admin'] = bool(admin)
        user['roles'] = roles
        self.c_users.upsert_item(user)
        # Audit
        self.c_admin_audit.create_item({
            'id': str(uuid4()),
            'action': 'grant_admin' if admin else 'revoke_admin',
            'actor_oid': actor_oid,
            'actor_email': (actor_email or '').lower(),
            'target_oid': target_oid,
            'target_email': (user.get('email') or '').lower(),
            'ts': _iso_now(),
        })
        return {'id': target_oid, 'roles': roles}
