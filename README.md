# GDRFA Shelter Services

A connected Al Awir case platform with employee and resident interfaces, persistent records, administrator-managed accounts, an operations overview and departure-readiness workflows.

## Run the website

From PowerShell in this project:

```powershell
.\START_PROJECT.bat
```

Open **http://127.0.0.1:8000**. This starts the backend AND serves the built frontend. Keep the terminal open. Python dependencies are installed automatically if missing. Node.js and npm are not needed to run the included built website.

If you want the frontend in its own terminal, leave the first terminal running and open another terminal in this project:

```powershell
.\START_FRONTEND.bat
```

Then open **http://127.0.0.1:5173**. This optional frontend server forwards API and video requests to the backend on port 8000. Do not run another Vite/frontend server on port 5173 at the same time.

Direct equivalents, if `py` is available:

```powershell
py -3 run_shelter.py
# In a second terminal, only if you want a separate frontend:
py -3 run_frontend.py
```

## Sign-in flow

1. On an empty installation, create the first administrator account on the server computer. Existing accounts and records are preserved.
2. Choose **Resident** or **Employee**. Employees sign in using their assigned username and password; saved roles determine their workspace.
3. Managers create named accounts and assign permissions under **People & permissions**. No fixed employee identities are required by the standard launch configuration.
4. Residents use their shelter reference and private access code, issued by the manager and linked to their own record.
5. The external UAE PASS sign-in button appears only when provider credentials are configured and simulation is disabled. Provision a verified provider UUID for employee identity linkage.

The launcher defaults to `SHELTER_AUTH_MODE=real`. This checkout's local `.env` selects `SHELTER_AUTH_MODE=simulation` to provide the residency project's local UAE PASS experience: identifier entry, number approval, information sharing and welcome. Local accounts and records remain isolated in `sandbox-*.db`; existing records are not migrated or deleted. Employee roles follow saved accounts, and no mobile notification or external document retrieval occurs. Configuration alone does not certify a live UAE PASS connection.

## Operations and case journey

- The manager overview shows overdue/escalated checks, department completion counts, departure readiness and shortcuts to case, travel and safety work.
- Each employee case shows the admission-to-departure stages and outstanding checks, owners, deadlines and missing travel details. Teams progress their tasks in parallel.
- Resident progress exposes stage completion without internal task assignments or clinical notes.
- Layouts adapt to desktop and mobile screens; larger reading text and reduced-motion preferences are supported.

After backend code changes, stop the backend terminal with Ctrl+C and start it again. After frontend code changes, run `BUILD_WEBSITE.ps1` and refresh the browser.

## Included functionality

- Separate Shelter Manager, Security Officer, Case Officer, Medical Team, Travel Coordinator and Resident workspaces.
- Security roster, saved gate movements and airport handovers with departure-readiness checks.
- Persistent admissions, unique admission references, case tasks, owners, deadlines and escalation flags.
- Document and consular tracking, PDF/image uploads and private downloads.
- Restricted medical notes; clearance tasks assigned to the medical role.
- Resident updates, language selection, English/Arabic resident labels, and two-way case messaging.
- Permits, ticket/flight details, departure time and airport transfer arrangements.
- Four working recorded-video players with pause, seek and full-screen controls.
- Safety reports, verification/dismissal decisions and incident resolution.
- Administrator-managed password accounts, account disabling, password changes and audit history.
- Password hashing, HttpOnly sessions, CSRF checks, optimistic record versioning and server-side role checks.

Videos are recorded footage, labelled as such. No live camera feed or clinical sensor readings are fabricated. Automated AI detection is optional and is not required for video playback.

## YOLO person detection

Run `SETUP_AI.bat` once to install the isolated AI runtime, then restart `START_PROJECT.bat`. The launcher automatically uses that runtime and enables YOLO. If `.env` explicitly contains `SHELTER_ENABLE_AI=0`, change it to `1` first.

Open **Security Officer → Video & incidents** (or manager safety monitoring). **Show YOLO detection on recordings** displays annotated frames, tracked people counts and the actual engine status. Disable the checkbox for original video playback. The included `backend/yolo11n.pt` weights run locally on the CPU with ByteTrack. All four recordings loop; these are not live cameras. Possible falls use a bounding-box heuristic and need officer review; detection does not establish identity or confirm an incident.

## Editing and rebuilding

After changing React or CSS files:

```powershell
.\BUILD_WEBSITE.ps1
```

Refresh the browser. The included Windows esbuild dependency compiles the frontend without npm. If you replace/remove `frontend/node_modules`, install Node.js and run `npm install` inside `frontend` before rebuilding. Ordinary Vite development remains available with `npm run dev` once Node/npm are installed.

## Real UAE PASS and deployment

See `RESIDENT_PORTAL_SETUP.md` for switching off the simulator and configuring approved UAE PASS credentials. External permit issuance, airline booking, embassy communications and airport dispatch are recorded/managed workflows; they do not submit transactions to external agencies.

The software is a local presentation/application build, not a production security certification. Real resident use requires institutional deployment/security review, managed data encryption/backups, retention controls and HTTPS.

Local person detection uses YOLO11n ONNX through OpenCV (SHELTER_AI_ENGINE=opencv) on this computer because Windows blocks PyTorch. See REAL_FOOTAGE_SOURCES.md for the indoor recordings and model source. UAE PASS employee sign-in includes a manager identifier with Copy & use.
