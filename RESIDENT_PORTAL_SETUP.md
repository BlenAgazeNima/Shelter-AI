# Authentication, storage and operating notes

## UAE PASS simulation (default launcher mode)

`START_PROJECT.bat` / `run_shelter.py` defaults to `SHELTER_AUTH_MODE=simulation`. The homepage explicitly labels this **UAE PASS Sandbox**. Enter fictional information and choose an employee or resident role. The approval screen simulates consent; no UAE PASS service is called and no identity is verified.

Sandbox data is separate:

- `backend/data/sandbox-cases.db`: cases, accounts, sessions, messages, file metadata and audit.
- `backend/data/sandbox-operations.db`: safety reports and incidents.
- `backend/data/sandbox-documents/`: uploaded documents.

Returning with the same test identity and role reuses the account. Residents can select a previously admitted sandbox record to present a complete employee-to-resident journey. This role selection is intentionally available only in the local sandbox. The endpoint refuses non-sandbox databases and non-local connections.

## Real account mode

Copy `.env.example` to `.env`, set `SHELTER_AUTH_MODE=real`, and restart. This disables simulation and uses a different `cases.db`/`operations.db` data store. On the first launch, create the first administrator locally. The administrator can create accounts with caseworker, medical, travel, security, supervisor or resident roles. Resident accounts must be linked to a case. Users can sign in with their assigned username/password and change their own password.

## Real UAE PASS connection

Real provider authentication is retained separately. It requires approved onboarding credentials and a registered callback URL. Set these in `.env`:

```text
SHELTER_AUTH_MODE=real
UAEPASS_ENV=staging
UAEPASS_CLIENT_ID=<approved client ID>
UAEPASS_CLIENT_SECRET=<approved client secret>
UAEPASS_REDIRECT_URI=https://<registered-host>/api/auth/callback
```

An administrator must bind the verified UAE PASS UUID when creating the user account. Authentication by UAE PASS never automatically creates shelter privileges. Optional existing administrator-provided mappings in `SHELTER_USERS_FILE` are also supported. Never put credentials in frontend files or source control.

The backend exchanges the code server-side, checks a browser-bound, single-use state value, calls the provider user-info endpoint, and establishes its own session. Live UAE PASS end-to-end testing has not been performed because approved credentials were not provided. The sandbox does not validate the real integration.

Official references:

- https://docs.uaepass.ae/feature-guides/authentication/web-application/endpoints
- https://docs.uaepass.ae/feature-guides/authentication/web-application/1.-obtaining-the-oauth2-access-code
- https://docs.uaepass.ae/feature-guides/authentication/web-application/2.-obtaining-the-access-token
- https://docs.uaepass.ae/feature-guides/authentication/web-application/3.-obtaining-authenticated-user-information-from-the-access-token

## Servers and storage

`START_PROJECT.bat` starts the complete app on localhost port 8000. `START_FRONTEND.bat` optionally serves the built frontend on port 5173 and forwards API/video requests to port 8000. Both require their terminal windows to remain open. The included Python runtime packages were installed for this machine's Python 3.13; first-launch installation covers a new machine when dependencies are absent.

Sessions are stored in SQLite and expire after one hour. Disabling an account invalidates its access on the next request. A password change ends other sessions. OAuth pending states and login throttling are process-local; use shared infrastructure before multi-worker deployment. The launcher binds only to localhost and permits local HTTP cookies. HTTPS hosting must set secure cookie configuration and bind the service through an approved reverse proxy.

File uploads accept PDF/PNG/JPEG up to 10 MB, check a format signature, use random storage names, and are downloaded as attachments behind authorization. Signature checks are not malware scanning. The same role rules apply server-side even if browser controls are modified.

SQLite and upload files are not application-encrypted. Protect them through deployment encryption, permissions, retention rules and backups before any real personal data is used. Resident updates in additional languages are written by staff; only English/Arabic interface labels are built in. The app does not automatically translate, email embassies, issue permits, purchase tickets or dispatch vehicles.

## Optional automated video analysis

The supplied recordings work without OpenCV or a machine-learning model. If automated detection is needed, install `backend/requirements.txt` and set `SHELTER_ENABLE_AI=1` before starting. These optional packages are larger and have not been installed or tested in this run. The safety review UI works without them using employee-entered reports.

## Tests

The test suite uses separate, temporary databases and never inserts presentation data into the working site's database. If testing on another machine, install `httpx==0.28.1` in addition to backend requirements. With the included packages:

```powershell
py -3 -c "import sys,unittest;sys.path.insert(0,'.runtime/python-packages');r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.discover('backend/tests'));sys.exit(not r.wasSuccessful())"
```

The checks cover admissions, roles, CSRF, medical privacy, resident isolation, uploads, conversations, account access, saved sessions, video byte-range playback, incident review, departure gates and sandbox separation.

