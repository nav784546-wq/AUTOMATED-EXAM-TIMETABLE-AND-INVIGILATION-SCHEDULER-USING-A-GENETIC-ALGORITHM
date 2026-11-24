# Local Installation and Execution Guide (Windows)

Follow these step-by-step instructions to install, configure, and run **ExamGrid GA — Automated Exam Timetable & Invigilation Scheduler** locally on a Windows 10 or Windows 11 computer.

---

## 1. Required Software to Install

Install the following free tools on your Windows computer before downloading the project:

1. **Git for Windows**
   - Download from: `https://git-scm.com/download/win`
   - Keep default options during installation (ensure **Git from the command line** is enabled).
2. **Node.js (v22 LTS recommended, minimum v20)**
   - Download the Windows Installer (`.msi`) from: `https://nodejs.org/`
   - Verify **npm package manager** and **Add to PATH** are selected during setup.
3. **Python 3 (v3.11+ recommended, minimum v3.10)**
   - Download from: `https://www.python.org/downloads/windows/`
   - **IMPORTANT**: On the very first installer screen, check **"Add python.exe to PATH"** before clicking **Install Now**.
4. **Visual Studio Code (VS Code)**
   - Download from: `https://code.visualstudio.com/`

### Crucial Windows Step: Ensure `python3` Command Works
The Node server (`server.ts`) launches the Python API using the command `python3`. On Windows, Python.org normally installs `python.exe` without creating a `python3.exe` alias.

1. Open **Command Prompt** (`cmd`) or **PowerShell** and check:
   ```powershell
   where python3
   ```
2. If `where python3` returns *"Could not find files"* (or points to an empty Microsoft Store stub):
   - Find where Python is installed by running:
     ```powershell
     where python
     ```
   - Open that folder in File Explorer (for example, `C:\Users\<YourName>\AppData\Local\Programs\Python\Python311\`), copy `python.exe`, and paste a duplicate named **`python3.exe`** in the same folder.
   - Verify again in a **new** terminal:
     ```powershell
     python3 --version
     ```
     You should see `Python 3.11.x` (or `3.10+`).

---

## 2. Clone the Project & Open in Visual Studio Code

1. Open **PowerShell** or **Command Prompt** and navigate to the folder where you keep projects (for example, `Documents`):
   ```powershell
   cd %USERPROFILE%\Documents
   ```
2. Clone the repository from GitHub (replace `<REPOSITORY_URL>` with your repository URL):
   ```powershell
   git clone <REPOSITORY_URL> examgrid-ga
   cd examgrid-ga
   ```
   *(If you downloaded a ZIP from GitHub instead, extract it and `cd` into the extracted folder.)*
3. Open the folder in Visual Studio Code:
   ```powershell
   code .
   ```
   *(Or open VS Code → **File → Open Folder...** and select the `examgrid-ga` folder.)*
4. Open VS Code's integrated terminal by pressing **`Ctrl + ` `** (or **Terminal → New Terminal**).

---

## 3. Install Dependencies

In the VS Code terminal (inside the project root folder):

1. **Install all Node.js / Frontend & Server packages**:
   ```powershell
   npm install
   ```
2. **Python dependencies (Optional — only for standalone FastAPI mode)**:
   - The standard app runs `backend/server.py`, which uses **Python 3's built-in standard library only** (`http.server`, `sqlite3`). No `pip install` is required to run `npm run dev`.
   - Only if you plan to run the optional FastAPI entry point (`backend/main.py`) separately, install:
     ```powershell
     pip install -r backend/requirements.txt
     ```

---

## 4. Configure Environment Variables

1. Copy `.env.example` to create a `.env` file in the project root:
   ```powershell
   copy .env.example .env
   ```
2. Open `.env` in VS Code. By default it contains:
   ```env
   GEMINI_API_KEY="MY_GEMINI_API_KEY"
   APP_URL="MY_APP_URL"
   ```
3. For local usage:
   - You can set `APP_URL="http://localhost:3000"`.
   - Leave `GEMINI_API_KEY` as-is unless your deployment specifically uses it; the Genetic Algorithm scheduler, conflict detector, hall allocator, and Excel/PDF exports run locally without any AI API key.

---

## 5. Database Configuration (SQLite & Optional Firebase)

The application supports two persistence modes out of the box:

### Mode A: Local SQLite Database (Zero Cloud Setup Required)
- SQLite is **automatically initialized** the first time the backend starts.
- Database file location: `backend/examgrid.db`
- `backend/database.py` automatically creates all 19 tables and seeds initial sample data (6 departments, 3 batches, 13 sections, 8 subjects, 6 halls, 8 faculty members, and 10 students).
- Access the app in local bypass mode via `http://localhost:3000/?autostart=1` to use SQLite immediately without logging in.

### Mode B: Cloud Firestore + Firebase Authentication
- Pre-configured connection details are in `firebase-applet-config.json` and `src/firebase.js`.
- If you connect your own Firebase project:
  1. Replace the values in `firebase-applet-config.json` with your Firebase project's web config and Firestore database ID.
  2. In **Firebase Console → Authentication → Sign-in method**, enable **Google** and/or **Email/Password**.
  3. Deploy `firestore.rules` to your Firebase project so role-based permissions apply cleanly.

---

## 6. Start the Application (Frontend & Backend Together)

A single command starts **both** the Node/Express + Vite frontend server (port `3000`) and the Python SQLite backend server (port `5000`):

```powershell
npm run dev
```

You should see terminal output confirming:
- Python backend running on `http://127.0.0.1:5000`
- Express + Vite server running on `http://localhost:3000`

### Access the Dashboard
- **Standard Login Screen**: Open `http://localhost:3000`
- **Direct Local Mode (no sign-in needed)**: Open `http://localhost:3000/?autostart=1`

### Optional: Production Build & Run
To test the compiled production bundle locally:
```powershell
npm run build
npm start
```
*(In production mode, Express serves the compiled `dist/` assets on `http://localhost:3000` while continuing to proxy `/api/*` to Python.)*

### Optional: Running Unit Tests & Type Checking
- TypeScript check: `npm run lint`
- Frontend Node unit tests: `node --test src/utils/*.test.js`
- Python backend unit tests: `python3 -m unittest discover -s backend/tests`

---

## 7. Stopping and Restarting the Application

- **Stop the servers**: Click inside the VS Code terminal and press **`Ctrl + C`**. If prompted `Terminate batch job (Y/N)?`, type **`Y`** and press **Enter**.
- **Restart the servers**: Run `npm run dev` again in the terminal.
- If a background Python process stayed open on port `5000`, find and terminate it in PowerShell:
  ```powershell
  netstat -ano | findstr :5000
  taskkill /PID <PID_NUMBER> /F
  ```

---

## 8. Troubleshooting Common Windows Errors

| Error / Symptom | Likely Cause | Fix |
|---|---|---|
| `'python3' is not recognized` or `spawn python3 ENOENT` | Windows Python installer only created `python.exe`, not `python3.exe`. | Duplicate `python.exe` as `python3.exe` in your Python installation folder (see Section 1), restart VS Code, and verify `python3 --version`. |
| `EADDRINUSE: address already in use :::3000` | Another app or previous run is already using port `3000`. | Stop the old terminal (`Ctrl + C`), or run `netstat -ano | findstr :3000` followed by `taskkill /PID <PID> /F`. |
| `ECONNREFUSED 127.0.0.1:5000` on API requests | Python backend failed to start or crashed on port `5000`. | Run `python3 backend/server.py` manually in a terminal to see the Python error, or clear port `5000` if already occupied. |
| `npm` execution blocked by PowerShell policy (`running scripts is disabled`) | Windows PowerShell restricted execution policy. | Run Command Prompt (`cmd`) instead of PowerShell, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` in PowerShell. |
| *"Email/Password sign-in is not enabled"* on Login | Firebase Email/Password auth provider is disabled. | Use **Continue with Google**, use `http://localhost:3000/?autostart=1` for local SQLite testing, or enable Email/Password in Firebase Console. |
| `sqlite3.OperationalError: database is locked` | Two Python backend instances are accessing `backend/examgrid.db` simultaneously. | Close duplicate terminals running `npm run dev` or `backend/server.py`, then start a single instance. |
