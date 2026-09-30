import uuid
import time
import unittest
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.app import cases


class CaseWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.original_db = cases.DB
        directory = Path(__file__).resolve().parent / '.test-data'
        directory.mkdir(exist_ok=True)
        self.test_db = directory / (uuid.uuid4().hex + '.db')
        cases.DB = self.test_db
        cases.SESSIONS.clear()
        app = FastAPI()
        app.include_router(cases.router)
        self.client = TestClient(app)
        self.as_role('supervisor')

    def tearDown(self):
        self.client.close()
        cases.DB = self.original_db
        self.test_db.unlink(missing_ok=True)

    def as_role(self, role, case_id=None):
        cases.SESSIONS['test-session'] = dict(uuid='test-user', role=role, case_id=case_id, csrf='test-csrf', expires=time.time()+600)
        self.client.cookies.set('shelter_session','test-session')
        self.client.headers['X-CSRF-Token']='test-csrf'

    def admit(self, ref='TEST-001'):
        response = self.client.post('/api/cases', json=dict(admission_ref=ref,name='Fictional resident',nationality='Demo',language='English'))
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def update(self, record, kind, data):
        return self.client.patch('/api/cases/'+record['id'],json=dict(version=record['version'],kind=kind,data=data))

    def test_requires_session_and_csrf(self):
        self.client.cookies.clear()
        self.assertEqual(self.client.get('/api/cases').status_code,401)
        self.as_role('supervisor')
        del self.client.headers['X-CSRF-Token']
        self.assertEqual(self.client.post('/api/cases',json=dict(admission_ref='NO-CSRF',name='Test',nationality='Demo',language='English')).status_code,403)
        self.assertEqual(self.client.post('/api/auth/logout').status_code,403)

    def test_duplicate_and_persistence(self):
        record=self.admit()
        self.assertEqual(self.client.post('/api/cases',json=dict(admission_ref='TEST-001',name='Other',nationality='Demo',language='English')).status_code,409)
        self.assertEqual(self.client.get('/api/cases').json()[0]['id'],record['id'])
        with cases.connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM audit').fetchone()[0],1)

    def test_resident_privacy_and_read_only(self):
        first=self.admit()
        self.admit('TEST-002')
        self.as_role('resident',first['id'])
        records=self.client.get('/api/cases').json()
        self.assertEqual(len(records),1)
        self.assertNotIn('medical',records[0])
        self.assertNotIn('identification',records[0])
        self.assertNotIn('tasks',records[0])
        self.assertEqual(self.update(first,'medical',{'notes':'Forbidden'}).status_code,403)
        self.assertEqual(self.client.get('/api/cases/'+first['id']+'/audit').status_code,403)

    def test_medical_permissions(self):
        record=self.admit()
        self.as_role('medical')
        result=self.update(record,'medical',{'notes':'Fictional private note'})
        self.assertEqual(result.status_code,200)
        record=result.json()
        self.as_role('caseworker')
        self.assertNotIn('medical',self.client.get('/api/cases').json()[0])
        self.assertEqual(self.update(record,'medical',{'notes':'Forbidden'}).status_code,403)
        self.assertEqual(self.update(record,'task',dict(id='medical',owner='Caseworker',due='2026-10-01',done=True,escalated=False)).status_code,403)

    def test_version_conflict(self):
        record=self.admit()
        self.assertEqual(self.update(record,'update',dict(language='English',message='Your next step is document review.')).status_code,200)
        self.assertEqual(self.update(record,'update',dict(language='English',message='Stale update')).status_code,409)
        self.assertEqual(len(self.client.get('/api/cases').json()[0]['updates']),1)

    def test_departure_gate_and_closure(self):
        record=self.admit()
        self.assertEqual(self.update(record,'depart',{}).status_code,409)
        for task in record['tasks']:
            response=self.update(record,'task',dict(id=task['id'],owner='Assigned team',due='2026-10-01',done=True,escalated=False))
            self.assertEqual(response.status_code,200,response.text)
            record=response.json()
        self.assertEqual(self.update(record,'depart',{}).status_code,409)
        record=self.update(record,'travel',dict(permit='TEST-PERMIT',flight='TEST-FLIGHT',departure='2026-10-01T14:00',transfer='TEST-TRANSFER')).json()
        response=self.update(record,'depart',{})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['status'],'Departed')
        self.assertEqual(self.update(response.json(),'medical',{'notes':'After closure'}).status_code,409)

    def test_invalid_deadline(self):
        record=self.admit()
        self.assertEqual(self.update(record,'task',dict(id='identity',owner='Team',due='invalid',done=False,escalated=True)).status_code,422)

    def test_oauth_state_validation_and_logout(self):
        self.assertEqual(self.client.get('/api/auth/callback?state=forged&code=forged').status_code,400)
        self.assertEqual(self.client.post('/api/auth/logout').status_code,200)
        self.assertEqual(self.client.get('/api/auth/me').status_code,401)


if __name__=='__main__':
    unittest.main()
