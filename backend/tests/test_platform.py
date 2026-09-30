import os
import uuid
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.app import cases, database, case_support, accounts
from backend.app.main import app


class PlatformTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(__file__).resolve().parent/'.test-data'/uuid.uuid4().hex
        self.root.mkdir(parents=True)
        self.original=(cases.DB,database.DB_PATH,case_support.UPLOADS)
        cases.DB=self.root/'cases.db'
        database.DB_PATH=self.root/'operations.db'
        case_support.UPLOADS=self.root/'uploads'
        self.env=patch.dict(os.environ,{'SHELTER_LOCAL_HTTP':'1'})
        self.env.start()
        cases.SESSIONS.clear();accounts.ATTEMPTS.clear()
        self.client=TestClient(app)
        database.init_db()
        result=self.client.post('/api/auth/setup',json=dict(username='administrator',password='Long-test-password-77',name='Test administrator'))
        self.assertEqual(result.status_code,200,result.text)
        self.client.headers['X-CSRF-Token']=result.json()['csrf']

    def tearDown(self):
        self.client.close();self.env.stop()
        cases.DB,database.DB_PATH,case_support.UPLOADS=self.original
        # Only remove this test's explicitly created files, never application data.
        if (self.root/'uploads').exists():
            for file in (self.root/'uploads').iterdir(): file.unlink()
            (self.root/'uploads').rmdir()
        for file in self.root.iterdir(): file.unlink()
        self.root.rmdir()

    def admit(self,ref='CASE-001'):
        r=self.client.post('/api/cases',json=dict(admission_ref=ref,name='Test resident',nationality='Test',language='English'))
        self.assertEqual(r.status_code,201,r.text)
        return r.json()

    def account(self,role='resident',case_id=None):
        r=self.client.post('/api/accounts',json=dict(username=role+'-user',password='Long-test-password-77',name='Test '+role,role=role,case_id=case_id))
        self.assertEqual(r.status_code,201,r.text)

    def login(self,username='resident-user',password='Long-test-password-77'):
        r=self.client.post('/api/auth/password',json=dict(username=username,password=password))
        self.assertEqual(r.status_code,200,r.text)
        self.client.headers['X-CSRF-Token']=r.json()['csrf']

    def test_setup_is_single_use(self):
        self.assertFalse(self.client.get('/api/auth/config').json()['setup_required'])
        r=self.client.post('/api/auth/setup',json=dict(username='intruder',password='Long-test-password-77',name='Second'))
        self.assertEqual(r.status_code,409)

    def test_resident_login_scope_and_messages(self):
        record=self.admit();other=self.admit('CASE-002')
        self.account(case_id=record['id']);self.login()
        self.assertEqual(len(self.client.get('/api/cases').json()),1)
        self.assertEqual(self.client.get('/api/accounts').status_code,403)
        self.assertEqual(self.client.get('/api/cameras').status_code,403)
        self.assertEqual(self.client.get('/api/cases/'+other['id']+'/messages').status_code,403)
        url='/api/cases/'+record['id']+'/messages'
        self.assertEqual(self.client.post(url,json={'message':'Please help with documents.'}).status_code,201)
        self.login('administrator')
        self.assertEqual(self.client.get(url).json()[0]['message'],'Please help with documents.')
        self.assertEqual(self.client.post(url,json={'message':'Your case officer will assist.'}).status_code,201)
        self.login()
        self.assertEqual(len(self.client.get(url).json()),2)

    def test_private_documents_and_validation(self):
        record=self.admit();other=self.admit('CASE-002');self.account(case_id=record['id']);self.login()
        url='/api/cases/'+record['id']+'/files'
        self.assertEqual(self.client.post(url+'?filename=unsafe.html',content=b'<html>').status_code,422)
        self.assertEqual(self.client.post(url+'?filename=wrong.pdf',content=b'not pdf').status_code,422)
        data=b'%PDF-1.4\nTest-only document'
        self.assertEqual(self.client.post(url+'?filename=identity.pdf',content=data).status_code,201)
        file_id=self.client.get(url).json()[0]['id']
        self.assertEqual(self.client.get(url+'/'+file_id).content,data)
        self.assertEqual(self.client.get('/api/cases/'+other['id']+'/files/'+file_id).status_code,403)

    def test_recordings_and_byte_ranges(self):
        self.assertEqual(len(self.client.get('/api/cameras').json()),4)
        for camera in ('dining','sleeping','recreation','corridor'):
            r=self.client.get('/api/media/'+camera,headers={'Range':'bytes=0-1023'})
            self.assertEqual(r.status_code,206,r.text[:100] if r.status_code!=206 else '')
            self.assertEqual(len(r.content),1024)
            self.assertEqual(r.headers['content-type'],'video/mp4')
        self.client.cookies.clear()
        self.assertEqual(self.client.get('/api/media/dining').status_code,401)

    def test_incident_flow(self):
        r=self.client.post('/api/safety-reports',json=dict(camera_id='dining',title='Review event',details='At 00:03',severity='Medium'))
        self.assertEqual(r.status_code,201,r.text)
        alert_id=r.json()['id']
        r=self.client.post(f'/api/alerts/{alert_id}/verify',json=dict(officer='Forged name',category='Safety',action_taken='Checked recording',note='Reviewed'))
        self.assertEqual(r.status_code,200,r.text)
        incident=self.client.get('/api/incidents').json()[0]
        self.assertEqual(incident['verified_by'],'Test administrator')
        r=self.client.post('/api/incidents/'+str(incident['id'])+'/resolve',json=dict(officer='Forged name',resolution_note='Follow-up completed'))
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(self.client.get('/api/incidents').json()[0]['status'],'Resolved')

    def test_account_revocation(self):
        self.account('caseworker')
        account=next(a for a in self.client.get('/api/accounts').json() if a['role']=='caseworker')
        employee=TestClient(app)
        r=employee.post('/api/auth/password',json=dict(username='caseworker-user',password='Long-test-password-77'))
        self.assertEqual(r.status_code,200)
        self.assertEqual(employee.get('/api/cases').status_code,200)
        self.client.patch('/api/accounts/'+account['id'],json={'active':False})
        self.assertEqual(employee.get('/api/cases').status_code,401)
        employee.close()

    def test_change_password_and_session_persistence(self):
        cases.SESSIONS.clear()
        self.assertEqual(self.client.get('/api/auth/me').status_code,200)
        r=self.client.post('/api/auth/change-password',json=dict(current='Long-test-password-77',replacement='New-long-password-88'))
        self.assertEqual(r.status_code,200,r.text)
        self.client.headers['X-CSRF-Token']=r.json()['csrf']
        self.client.post('/api/auth/logout')
        self.assertEqual(self.client.post('/api/auth/password',json=dict(username='administrator',password='Long-test-password-77')).status_code,401)
        self.login('administrator','New-long-password-88')

    def test_no_fabricated_health_data(self):
        self.assertEqual(self.client.get('/api/residents/health').json(),[])

    def test_security_workspace_permissions_and_movement(self):
        record=self.admit()
        self.account('security');self.login('security-user')
        self.assertEqual(self.client.get('/api/cameras').status_code,200)
        self.assertEqual(self.client.get('/api/media/dining',headers={'Range':'bytes=0-99'}).status_code,206)
        self.assertEqual(self.client.get('/api/cases').status_code,403)
        self.assertEqual(self.client.get('/api/accounts').status_code,403)
        self.assertEqual(self.client.get('/api/cases/'+record['id']+'/files').status_code,403)
        roster=self.client.get('/api/security/roster').json()
        self.assertEqual(set(roster[0]),{'id','name','status','transfer'})
        movement=dict(case_id=record['id'],event='Arrival',location='Reception',notes='Escorted to reception.')
        self.assertEqual(self.client.post('/api/security/movements',json=movement).status_code,201)
        self.assertEqual(self.client.get('/api/security/movements').json()[0]['officer'],'Test security')
        movement['event']='Airport handover'
        self.assertEqual(self.client.post('/api/security/movements',json=movement).status_code,409)

    def test_resident_access_code_and_record_isolation(self):
        first=self.admit('RES-001');second=self.admit('RES-002')
        issued=self.client.post('/api/accounts/resident-access',json={'case_id':first['id']})
        self.assertEqual(issued.status_code,201,issued.text)
        access=issued.json()
        self.assertEqual(self.client.post('/api/accounts/resident-access',json={'case_id':first['id']}).status_code,409)
        resident=TestClient(app)
        credentials=dict(username=access['reference'],password=access['access_code'])
        self.assertEqual(resident.post('/api/auth/resident',json={**credentials,'password':'wrong'}).status_code,401)
        result=resident.post('/api/auth/resident',json=credentials)
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['role'],'resident')
        self.assertEqual([r['id'] for r in resident.get('/api/cases').json()],[first['id']])
        self.assertEqual(resident.get('/api/cases/'+second['id']+'/files').status_code,403)
        self.assertEqual(resident.post('/api/auth/resident',json=dict(username='administrator',password='Long-test-password-77')).status_code,401)
        resident.close()

if __name__=='__main__':unittest.main()
