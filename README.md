# GDRFA Shelter Services

A connected shelter case platform with separate employee and resident interfaces, GDRFA styling, saved records, and an explicitly labelled UAE PASS sandbox for fictional presentation identities.

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

1. Choose **Resident** or **Employee** first.
2. For employee UAE PASS sign-in, enter a saved identity from the table below. Select the displayed number in the approval screen. Your saved name and role open the assigned workspace automatically.
3. Residents use their shelter reference and access code, or a UAE PASS identifier linked by the manager. Both methods open only that resident's record.
4. Managers issue resident codes and link identifiers under **People & permissions → Resident sign-in access**. The code is displayed once. The manager can also create additional employee accounts with an optional local UAE PASS identifier.
5. Number requests expire after two minutes and can only be used once. Unknown, disabled or incorrectly matched identities cannot sign in.

| Workspace | Identifier | Saved name |
|---|---|---|
| Shelter Manager | `manager@shelter.test` | Aisha Hassan |
| Security Officer | `security@shelter.test` | Omar Ali |
| Case Officer | `case@shelter.test` | Mariam Ahmed |
| Medical Team | `medical@shelter.test` | Dr Sara Khalid |
| Travel Coordinator | `travel@shelter.test` | Khalid Salem |

This local presentation flow does not contact UAE PASS or send phone notifications. These are fictional staff identities. It remains isolated in `sandbox-*.db`; the clean presentation UI does not change the authentication environment. Real UAE PASS integration remains a separate configuration.

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
