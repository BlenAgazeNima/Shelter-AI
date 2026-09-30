import os,uuid,unittest
from pathlib import Path
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.app import cases,accounts
from backend.app.uaepass_sandbox import router,seed_staff_identities,CHALLENGES

class SandboxTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(__file__).resolve().parent/'.test-data'/uuid.uuid4().hex
        self.root.mkdir(parents=True)
        self.old_db=cases.DB;cases.DB=self.root/'sandbox-cases.db'
        self.env=patch.dict(os.environ,{'SHELTER_AUTH_MODE':'simulation','SHELTER_LOCAL_HTTP':'1'});self.env.start()
        cases.SESSIONS.clear();CHALLENGES.clear();accounts.ATTEMPTS.clear()
        app=FastAPI();app.include_router(cases.router);app.include_router(accounts.router);app.include_router(router)
        self.client=TestClient(app);seed_staff_identities()
    def tearDown(self):
        self.client.close();self.env.stop();cases.DB=self.old_db
        for f in self.root.iterdir():f.unlink()
        self.root.rmdir()
    def challenge(self,identifier='manager@shelter.test',audience='employee'):
        r=self.client.post('/api/auth/simulation/challenge',json=dict(identifier=identifier,audience=audience))
        self.assertEqual(r.status_code,200,r.text)
        return dict(identifier=identifier,audience=audience,challenge_id=r.json()['challenge_id'],selected_number=r.json()['number'])
    def login(self,identifier='manager@shelter.test',audience='employee',**extra):
        result=self.client.post('/api/auth/simulation/complete',json={**self.challenge(identifier,audience),**extra})
        self.assertEqual(result.status_code,200,result.text)
        self.client.headers['X-CSRF-Token']=result.json()['csrf']
        return result.json()
    def test_saved_employee_identity_controls_name_and_role(self):
        user=self.login('security@shelter.test',role='supervisor',name='Forged name')
        self.assertEqual(user['role'],'security');self.assertEqual(user['name'],'Omar Ali')
        for email,role in [('manager','supervisor'),('case','caseworker'),('medical','medical'),('travel','travel')]:
            self.assertEqual(self.login(email+'@shelter.test')['role'],role)
    def test_resident_binding_and_record_isolation(self):
        self.login()
        first=self.client.post('/api/cases',json=dict(admission_ref='FIRST',name='First resident',nationality='Test',language='English')).json()
        second=self.client.post('/api/cases',json=dict(admission_ref='SECOND',name='Second resident',nationality='Test',language='English')).json()
        link=self.client.post('/api/accounts/resident-access',json=dict(case_id=first['id'],identifier='resident@example.test'))
        self.assertEqual(link.status_code,201,link.text)
        self.client.post('/api/auth/logout')
        user=self.login('resident@example.test','resident',case_id=second['id'],name='Someone else')
        self.assertEqual(user['case_id'],first['id']);self.assertEqual(user['name'],'First resident')
        self.assertEqual([r['id'] for r in self.client.get('/api/cases').json()],[first['id']])
    def test_unlinked_or_wrong_audience_denied(self):
        for identifier,audience in [('unknown@example.test','resident'),('manager@shelter.test','resident')]:
            self.assertEqual(self.client.post('/api/auth/simulation/challenge',json=dict(identifier=identifier,audience=audience)).status_code,403)
        self.assertEqual(self.client.get('/api/auth/simulation/residents').status_code,404)
        self.assertEqual(self.client.post('/api/auth/simulation/approve',json={}).status_code,404)
    def test_number_matching_expiry_and_single_use(self):
        data=self.challenge();self.assertEqual(self.client.post('/api/auth/simulation/complete',json=data).status_code,200)
        self.assertEqual(self.client.post('/api/auth/simulation/complete',json=data).status_code,401)
        data=self.challenge();data['selected_number']=-1
        self.assertEqual(self.client.post('/api/auth/simulation/complete',json=data).status_code,401)
        data=self.challenge();CHALLENGES[data['challenge_id']]['expires']=0
        self.assertEqual(self.client.post('/api/auth/simulation/complete',json=data).status_code,401)
    def test_audience_and_identifier_bound_to_request(self):
        data=self.challenge();data['audience']='resident'
        self.assertEqual(self.client.post('/api/auth/simulation/complete',json=data).status_code,401)
        data=self.challenge();data['identifier']='security@shelter.test'
        self.assertEqual(self.client.post('/api/auth/simulation/complete',json=data).status_code,401)
    def test_disabled_account_cannot_approve_existing_request(self):
        data=self.challenge('security@shelter.test')
        with cases.connection() as db:db.execute("UPDATE accounts SET active=0 WHERE role='security'")
        self.assertEqual(self.client.post('/api/auth/simulation/complete',json=data).status_code,403)
    def test_real_mode_cannot_use_local_identity(self):
        with patch.dict(os.environ,{'SHELTER_AUTH_MODE':'real'}):
            self.assertEqual(self.client.post('/api/auth/simulation/challenge',json=dict(identifier='manager@shelter.test',audience='employee')).status_code,404)
    def test_real_database_cannot_use_local_identity(self):
        cases.DB=self.root/'cases.db'
        self.assertEqual(self.client.post('/api/auth/simulation/challenge',json=dict(identifier='manager@shelter.test',audience='employee')).status_code,404)

if __name__=='__main__':unittest.main()
