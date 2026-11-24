import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'examgrid.db')

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS batches (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS sections (
        id TEXT PRIMARY KEY,
        department TEXT NOT NULL,
        name TEXT NOT NULL,
        UNIQUE(department, name)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        batch TEXT NOT NULL,
        section TEXT NOT NULL,
        semester INTEGER NOT NULL,
        enrolled_count INTEGER NOT NULL
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS halls (
        id TEXT PRIMARY KEY,
        hall_number TEXT UNIQUE NOT NULL,
        building TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        available INTEGER NOT NULL DEFAULT 1
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS faculty (
        id TEXT PRIMARY KEY,
        employee_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        designation TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        available INTEGER NOT NULL DEFAULT 1,
        max_duties INTEGER NOT NULL DEFAULT 4
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        reg_no TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        section TEXT NOT NULL,
        batch TEXT NOT NULL,
        semester INTEGER NOT NULL,
        enrolled_subject_ids TEXT NOT NULL
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS subsections (
        id TEXT PRIMARY KEY,
        department TEXT NOT NULL,
        subsection_count INTEGER NOT NULL,
        total_students INTEGER NOT NULL,
        assignments_json TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        schedule_json TEXT NOT NULL,
        fitness REAL NOT NULL,
        hard_conflicts INTEGER NOT NULL,
        soft_score INTEGER NOT NULL,
        history_json TEXT DEFAULT '[]',
        conflicts_json TEXT DEFAULT '{}',
        converged_at_generation INTEGER DEFAULT 0,
        execution_time_ms REAL DEFAULT 0,
        scope TEXT DEFAULT 'ALL'
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS timetables (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        entries_json TEXT NOT NULL,
        scope TEXT DEFAULT 'ALL',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS conflict_reports (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        student_clashes INTEGER NOT NULL DEFAULT 0,
        invigilator_conflicts INTEGER NOT NULL DEFAULT 0,
        capacity_violations INTEGER NOT NULL DEFAULT 0,
        hall_double_bookings INTEGER NOT NULL DEFAULT 0,
        total_hard_violations INTEGER NOT NULL DEFAULT 0,
        utilization_rate REAL NOT NULL DEFAULT 0,
        workload_std_dev REAL NOT NULL DEFAULT 0,
        flagged_items_json TEXT NOT NULL DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS hall_allocations (
        id TEXT PRIMARY KEY,
        exam_date TEXT NOT NULL,
        session TEXT NOT NULL,
        selected_departments_json TEXT NOT NULL,
        target_mode TEXT NOT NULL DEFAULT 'PERCENT_50',
        target_percentage INTEGER NOT NULL DEFAULT 50,
        custom_target_per_dept INTEGER NOT NULL DEFAULT 0,
        max_depts_per_hall INTEGER NOT NULL DEFAULT 2,
        selected_hall_ids_json TEXT NOT NULL DEFAULT '[]',
        total_students INTEGER NOT NULL DEFAULT 0,
        total_allocated INTEGER NOT NULL DEFAULT 0,
        halls_required INTEGER NOT NULL DEFAULT 0,
        remaining_available_capacity INTEGER NOT NULL DEFAULT 0,
        hall_summaries_json TEXT NOT NULL DEFAULT '[]',
        allocations_json TEXT NOT NULL DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS optimization_runs (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'ALL',
        execution_mode TEXT NOT NULL DEFAULT 'WEB_WORKER',
        status TEXT NOT NULL DEFAULT 'OPTIMAL',
        best_fitness REAL NOT NULL DEFAULT 0,
        converged_at_generation INTEGER NOT NULL DEFAULT 0,
        execution_time_ms REAL NOT NULL DEFAULT 0,
        population_size INTEGER NOT NULL DEFAULT 40,
        generations INTEGER NOT NULL DEFAULT 50,
        mutation_rate REAL NOT NULL DEFAULT 0.12,
        crossover_rate REAL NOT NULL DEFAULT 0.8,
        constraint_config_json TEXT NOT NULL DEFAULT '{}',
        conflicts_json TEXT NOT NULL DEFAULT '{}',
        constraint_report_json TEXT NOT NULL DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS password_reset_requests (
        id TEXT PRIMARY KEY,
        email_hash TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        invalidated_reason TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER DEFAULT NULL
    )
    ''')
    cursor.execute(
        'CREATE INDEX IF NOT EXISTS idx_password_reset_email_status ON password_reset_requests(email_hash, status)'
    )

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS admin_identity_links (
        email_hash TEXT PRIMARY KEY,
        firebase_uid TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        updated_at INTEGER NOT NULL
    )
    ''')
    cursor.execute(
        'CREATE INDEX IF NOT EXISTS idx_admin_identity_uid ON admin_identity_links(firebase_uid)'
    )

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS password_reset_audit_logs (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        outcome TEXT NOT NULL,
        firebase_uid TEXT DEFAULT NULL,
        uid_resolution TEXT NOT NULL DEFAULT 'unlinked',
        email_hash TEXT NOT NULL DEFAULT '',
        error_code TEXT NOT NULL DEFAULT '',
        failure_reason TEXT NOT NULL DEFAULT '',
        client_ip TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        created_at_iso TEXT NOT NULL
    )
    ''')
    cursor.execute(
        'CREATE INDEX IF NOT EXISTS idx_pw_audit_uid_created ON password_reset_audit_logs(firebase_uid, created_at DESC)'
    )
    cursor.execute(
        'CREATE INDEX IF NOT EXISTS idx_pw_audit_outcome_created ON password_reset_audit_logs(outcome, created_at DESC)'
    )

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS admin_accounts (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        status TEXT NOT NULL DEFAULT 'active',
        firebase_uid TEXT DEFAULT NULL,
        created_by TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )
    ''')
    cursor.execute(
        'CREATE INDEX IF NOT EXISTS idx_admin_accounts_email ON admin_accounts(email)'
    )
    cursor.execute(
        'CREATE INDEX IF NOT EXISTS idx_admin_accounts_uid ON admin_accounts(firebase_uid)'
    )

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS system_audit_logs (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        summary TEXT NOT NULL,
        outcome TEXT NOT NULL DEFAULT 'SUCCESS',
        actor_email TEXT NOT NULL DEFAULT '',
        actor_uid TEXT DEFAULT NULL,
        actor_role TEXT NOT NULL DEFAULT '',
        target_type TEXT NOT NULL DEFAULT '',
        target_id TEXT NOT NULL DEFAULT '',
        target_label TEXT NOT NULL DEFAULT '',
        client_ip TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        created_at_iso TEXT NOT NULL
    )
    ''')
    cursor.execute(
        'CREATE INDEX IF NOT EXISTS idx_sys_audit_created ON system_audit_logs(created_at DESC)'
    )
    cursor.execute(
        'CREATE INDEX IF NOT EXISTS idx_sys_audit_cat_outcome ON system_audit_logs(category, outcome, created_at DESC)'
    )

    # Safely add new columns to existing schedules table if upgrading an existing examgrid.db
    existing_cols = {r['name'] for r in cursor.execute('PRAGMA table_info(schedules)').fetchall()}
    for col_name, col_def in [
        ('history_json', "TEXT DEFAULT '[]'"),
        ('conflicts_json', "TEXT DEFAULT '{}'"),
        ('converged_at_generation', 'INTEGER DEFAULT 0'),
        ('execution_time_ms', 'REAL DEFAULT 0'),
        ('scope', "TEXT DEFAULT 'ALL'"),
    ]:
        if col_name not in existing_cols:
            cursor.execute(f'ALTER TABLE schedules ADD COLUMN {col_name} {col_def}')

    # Safely add new columns to existing hall_allocations table if upgrading
    existing_hall_alloc_cols = {
        r['name'] for r in cursor.execute('PRAGMA table_info(hall_allocations)').fetchall()
    }
    for col_name, col_def in [
        ('target_percentage', 'INTEGER NOT NULL DEFAULT 50'),
        ('max_depts_per_hall', 'INTEGER NOT NULL DEFAULT 2'),
        ('selected_hall_ids_json', "TEXT NOT NULL DEFAULT '[]'"),
    ]:
        if col_name not in existing_hall_alloc_cols:
            cursor.execute(f'ALTER TABLE hall_allocations ADD COLUMN {col_name} {col_def}')

    # Indexes for scalable student & subject lookups and pagination
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_students_reg_no ON students(reg_no)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_students_dept_batch_sec ON students(department, batch, section)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_students_name ON students(name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_subjects_dept_batch_sem ON subjects(department, batch, semester)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_hall_allocations_date_session ON hall_allocations(exam_date, session)')

    conn.commit()

    cursor.execute("SELECT value FROM metadata WHERE key = 'seeded'")
    seeded_row = cursor.fetchone()
    if not seeded_row:
        cursor.execute('SELECT COUNT(*) as count FROM departments')
        if cursor.fetchone()['count'] == 0:
            seed_initial_data(conn)
        else:
            # Ensure initial sections exist for existing departments if upgrading DB
            cursor.execute('SELECT COUNT(*) as count FROM sections')
            if cursor.fetchone()['count'] == 0:
                seed_default_sections(conn)
        cursor.execute("INSERT OR REPLACE INTO metadata (key, value) VALUES ('seeded', '1')")
        conn.commit()

    conn.close()

def seed_default_sections(conn):
    cursor = conn.cursor()
    default_sections = [
        ('sec-1', 'BCA (AI & DS)', 'Section A'),
        ('sec-2', 'BCA (AI & DS)', 'Section B'),
        ('sec-3', 'BCA (AI & DS)', 'Section C'),
        ('sec-4', 'BCA (DT)', 'Section A'),
        ('sec-5', 'BCA (DT)', 'Section B'),
        ('sec-6', 'B.Sc. Computer Science (B.Sc. CSE)', 'Section A'),
        ('sec-7', 'B.Sc. Computer Science (B.Sc. CSE)', 'Section B'),
        ('sec-8', 'B.Tech', 'Section A'),
        ('sec-9', 'B.Tech', 'Section B'),
        ('sec-10', 'EEE', 'Section A'),
        ('sec-11', 'EEE', 'Section B'),
        ('sec-12', 'ECE', 'Section A'),
        ('sec-13', 'ECE', 'Section B'),
    ]
    cursor.executemany(
        'INSERT OR IGNORE INTO sections (id, department, name) VALUES (?, ?, ?)',
        default_sections,
    )
    conn.commit()

def seed_initial_data(conn):
    cursor = conn.cursor()
    initial_depts = [
        ('dept-1', 'BCA (AI & DS)'),
        ('dept-2', 'BCA (DT)'),
        ('dept-3', 'B.Sc. Computer Science (B.Sc. CSE)'),
        ('dept-4', 'B.Tech'),
        ('dept-5', 'EEE'),
        ('dept-6', 'ECE'),
    ]
    cursor.executemany('INSERT INTO departments (id, name) VALUES (?, ?)', initial_depts)

    initial_batches = [('b-1', '2023'), ('b-2', '2024'), ('b-3', '2025')]
    cursor.executemany('INSERT INTO batches (id, name) VALUES (?, ?)', initial_batches)
    seed_default_sections(conn)

    initial_subjects = [
        ('sub-1', 'AIDS301', 'Machine Learning Foundations', 'BCA (AI & DS)', '2024', 'Section A', 3, 58),
        ('sub-2', 'AIDS302', 'Data Wrangling & Visualization', 'BCA (AI & DS)', '2024', 'Section B', 3, 56),
        ('sub-3', 'AIDS501', 'Deep Learning & Neural Nets', 'BCA (AI & DS)', '2023', 'Section A', 5, 52),
        ('sub-4', 'DT301', 'Design Thinking & Prototyping', 'BCA (DT)', '2024', 'Section A', 3, 48),
        ('sub-5', 'CS201', 'Data Structures & Algorithms', 'B.Sc. Computer Science (B.Sc. CSE)', '2025', 'Section A', 1, 62),
        ('sub-6', 'BT301', 'Operating Systems', 'B.Tech', '2024', 'Section A', 3, 64),
        ('sub-7', 'EE302', 'Power Systems & Machines', 'EEE', '2024', 'Section A', 3, 50),
        ('sub-8', 'EC304', 'Digital Signal Processing', 'ECE', '2024', 'Section B', 3, 46),
    ]
    cursor.executemany(
        'INSERT INTO subjects (id, code, name, department, batch, section, semester, enrolled_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        initial_subjects
    )

    initial_halls = [
        ('hall-1', 'A-101', 'Main Academic Block', 60, 1),
        ('hall-2', 'A-102', 'Main Academic Block', 60, 1),
        ('hall-3', 'B-201', 'Science & Tech Wing', 100, 1),
        ('hall-4', 'B-202', 'Science & Tech Wing', 45, 1),
        ('hall-5', 'C-301', 'Computing Block', 70, 1),
        ('hall-6', 'D-105', 'Auditorium Hall', 120, 1),
    ]
    cursor.executemany(
        'INSERT INTO halls (id, hall_number, building, capacity, available) VALUES (?, ?, ?, ?, ?)',
        initial_halls
    )

    initial_faculty = [
        ('fac-1', 'FAC-101', 'Dr. Arvind Krishnan', 'BCA (AI & DS)', 'Professor', 'arvind.k@university.edu', '+91 98401 11201', 1, 4),
        ('fac-2', 'FAC-102', 'Prof. Meera Nair', 'BCA (AI & DS)', 'Associate Prof.', 'meera.nair@university.edu', '+91 98401 11202', 1, 4),
        ('fac-3', 'FAC-103', 'Dr. Rajeshwar Rao', 'BCA (DT)', 'Professor', 'rajeshwar.r@university.edu', '+91 98401 11203', 1, 4),
        ('fac-4', 'FAC-104', 'Prof. Ananya Sharma', 'B.Sc. Computer Science (B.Sc. CSE)', 'Assistant Prof.', 'ananya.s@university.edu', '+91 98401 11204', 1, 4),
        ('fac-5', 'FAC-105', 'Dr. Vikramaditya Sen', 'B.Tech', 'Professor', 'vikram.sen@university.edu', '+91 98401 11205', 1, 4),
        ('fac-6', 'FAC-106', 'Prof. Kavitha Menon', 'EEE', 'Assistant Prof.', 'kavitha.m@university.edu', '+91 98401 11206', 1, 4),
        ('fac-7', 'FAC-107', 'Dr. Suresh Babu', 'ECE', 'Associate Prof.', 'suresh.b@university.edu', '+91 98401 11207', 1, 4),
        ('fac-8', 'FAC-108', 'Prof. Deepika Iyer', 'B.Tech', 'Assistant Prof.', 'deepika.i@university.edu', '+91 98401 11208', 1, 4),
    ]
    cursor.executemany(
        'INSERT INTO faculty (id, employee_id, name, department, designation, email, phone, available, max_duties) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        initial_faculty
    )

    initial_students = [
        ('stu-1', '24AIDS001', 'Aarav Patel', 'BCA (AI & DS)', 'A', '2024', 3, json.dumps(['sub-1'])),
        ('stu-2', '24AIDS002', 'Diya Reddy', 'BCA (AI & DS)', 'A', '2024', 3, json.dumps(['sub-1'])),
        ('stu-3', '24AIDS045', 'Sneha Kulkarni', 'BCA (AI & DS)', 'B', '2024', 3, json.dumps(['sub-2'])),
        ('stu-4', '24AIDS088', 'Karthik Subramanian', 'BCA (AI & DS)', 'C', '2024', 3, json.dumps(['sub-2'])),
        ('stu-5', '23AIDS014', 'Rohan Verma', 'BCA (AI & DS)', 'A', '2023', 5, json.dumps(['sub-3'])),
        ('stu-6', '24DT008', 'Nikhil Deshmukh', 'BCA (DT)', 'A', '2024', 3, json.dumps(['sub-4'])),
        ('stu-7', '25CS003', 'Varun Malhotra', 'B.Sc. Computer Science (B.Sc. CSE)', 'A', '2025', 1, json.dumps(['sub-5'])),
        ('stu-8', '24BT011', 'Ishita Banerjee', 'B.Tech', 'A', '2024', 3, json.dumps(['sub-6'])),
        ('stu-9', '24EE019', 'Siddharth Gupta', 'EEE', 'A', '2024', 3, json.dumps(['sub-7'])),
        ('stu-10', '24EC022', 'Pooja Joshi', 'ECE', 'B', '2024', 3, json.dumps(['sub-8'])),
    ]
    cursor.executemany(
        'INSERT INTO students (id, reg_no, name, department, section, batch, semester, enrolled_subject_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        initial_students
    )

    conn.commit()
