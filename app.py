import sqlite3
import json
import uuid
import time
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

DB_FILE = 'quizforge.db'

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS tests (
                        id TEXT PRIMARY KEY,
                        title TEXT,
                        description TEXT,
                        duration INTEGER,
                        active BOOLEAN,
                        marking TEXT,
                        questions TEXT,
                        pdf_data TEXT,
                        created_at INTEGER
                     )''')
        c.execute('''CREATE TABLE IF NOT EXISTS students (
                        rollNo TEXT PRIMARY KEY,
                        name TEXT,
                        dob TEXT,
                        googleEmail TEXT,
                        googleUid TEXT,
                        created_at INTEGER
                     )''')
        c.execute('''CREATE TABLE IF NOT EXISTS submissions (
                        id TEXT PRIMARY KEY,
                        testId TEXT,
                        testTitle TEXT,
                        rollNo TEXT,
                        studentName TEXT,
                        answers TEXT,
                        score REAL,
                        maxScore REAL,
                        correct INTEGER,
                        incorrect INTEGER,
                        unanswered INTEGER,
                        total INTEGER,
                        timestamp INTEGER
                     )''')
        conn.commit()

init_db()

# --- Serve Static Files ---
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory('.', path)

# --- API Endpoints ---

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    rollNo = data.get('rollNo')
    name = data.get('name')
    if not rollNo or not name:
        return jsonify({"error": "Roll Number and Name are required"}), 400
    
    with get_db() as conn:
        c = conn.cursor()
        # Check if roll exists
        c.execute("SELECT * FROM students WHERE rollNo = ?", (rollNo,))
        if c.fetchone():
            return jsonify({"error": "Roll number already registered"}), 400
        
        c.execute("INSERT INTO students (rollNo, name, dob, googleEmail, googleUid, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                  (rollNo, name, data.get('dob', ''), data.get('googleEmail', ''), data.get('googleUid', ''), int(time.time()*1000)))
        conn.commit()
    
    return jsonify({"success": True, "student": {"rollNo": rollNo, "name": name, "googleEmail": data.get('googleEmail', '')}})

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    rollNo = data.get('rollNo')
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM students WHERE rollNo = ?", (rollNo,))
        student = c.fetchone()
        if not student:
            return jsonify({"error": "Roll number not found"}), 404
        
        return jsonify({"success": True, "student": {"rollNo": student['rollNo'], "name": student['name'], "googleEmail": student['googleEmail']}})

@app.route('/api/admin/pw', methods=['POST'])
def admin_pw():
    data = request.json
    # Hardcoded check for simplicity, in a real app this would use secure config
    if data.get('pw') == 'admin123':
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "Incorrect password"}), 401


# --- Test Management API ---

@app.route('/api/tests', methods=['GET'])
def get_tests():
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM tests")
        tests = []
        for row in c.fetchall():
            t = dict(row)
            t['active'] = bool(t['active'])
            t['marking'] = json.loads(t['marking']) if t['marking'] else {}
            t['questions'] = json.loads(t['questions']) if t['questions'] else []
            # Strip correct answers if not admin requesting
            for q in t['questions']:
                q.pop('correct', None)
                q.pop('solution', None)
            tests.append(t)
    return jsonify({"tests": tests})

@app.route('/api/admin/tests', methods=['GET'])
def get_admin_tests():
    # Includes everything (solutions + correct answers)
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM tests")
        tests = []
        for row in c.fetchall():
            t = dict(row)
            t['active'] = bool(t['active'])
            t['marking'] = json.loads(t['marking']) if t['marking'] else {}
            t['questions'] = json.loads(t['questions']) if t['questions'] else []
            tests.append(t)
    return jsonify({"tests": tests})

@app.route('/api/admin/tests/<test_id>', methods=['GET'])
def get_admin_test(test_id):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM tests WHERE id=?", (test_id,))
        row = c.fetchone()
        if not row:
            return jsonify({"error": "Test not found"}), 404
        t = dict(row)
        t['active'] = bool(t['active'])
        t['marking'] = json.loads(t['marking']) if t['marking'] else {}
        t['questions'] = json.loads(t['questions']) if t['questions'] else []
    return jsonify({"test": t})


@app.route('/api/admin/tests', methods=['POST'])
def save_test():
    data = request.json
    test_id = data.get('id', uuid.uuid4().hex)
    
    with get_db() as conn:
        c = conn.cursor()
        # Preserve existing pdf_data if not provided in request
        existing_pdf = data.get('pdf_data')
        if existing_pdf is None:
            c.execute("SELECT pdf_data FROM tests WHERE id=?", (test_id,))
            row = c.fetchone()
            if row:
                existing_pdf = row['pdf_data'] or ''
            else:
                existing_pdf = ''
        
        c.execute("""INSERT OR REPLACE INTO tests 
                     (id, title, description, duration, active, marking, questions, pdf_data, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM tests WHERE id=?), ?))""",
                  (test_id, data.get('title',''), data.get('description',''), data.get('duration',30),
                   data.get('active', False), json.dumps(data.get('marking',{})), json.dumps(data.get('questions',[])),
                   existing_pdf, test_id, int(time.time()*1000)))
        conn.commit()
    
    return jsonify({"success": True, "id": test_id})

@app.route('/api/admin/tests/<test_id>', methods=['DELETE'])
def delete_test(test_id):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("DELETE FROM tests WHERE id=?", (test_id,))
        c.execute("DELETE FROM submissions WHERE testId=?", (test_id,))
        conn.commit()
    return jsonify({"success": True})


# --- Taking Test API ---
@app.route('/api/tests/<test_id>', methods=['GET'])
def get_test(test_id):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM tests WHERE id=?", (test_id,))
        row = c.fetchone()
        if not row:
            return jsonify({"error": "Test not found"}), 404
        
        t = dict(row)
        t['active'] = bool(t['active'])
        t['marking'] = json.loads(t['marking']) if t['marking'] else {}
        t['questions'] = json.loads(t['questions']) if t['questions'] else []
        
        # Remove PDF base64 if it's there but don't send to save bandwidth until submit
        has_pdf = bool(t.get('pdf_data'))
        t.pop('pdf_data', None)
        t['has_pdf'] = has_pdf
        
        for q in t['questions']:
            q.pop('correct', None)
            q.pop('solution', None)
        return jsonify({"test": t})


@app.route('/api/tests/<test_id>/submit', methods=['POST'])
def submit_test(test_id):
    data = request.json
    rollNo = data.get('rollNo')
    answers = data.get('answers', {})
    
    with get_db() as conn:
        c = conn.cursor()
        
        # Check if already submitted
        c.execute("SELECT id FROM submissions WHERE testId=? AND rollNo=?", (test_id, rollNo))
        if c.fetchone():
            return jsonify({"error": "Test already submitted"}), 400
        
        # Fetch actual test to calculate score securely
        c.execute("SELECT * FROM tests WHERE id=?", (test_id,))
        row = c.fetchone()
        if not row:
            return jsonify({"error": "Test not found"}), 404
        
        t = dict(row)
        marking = json.loads(t['marking']) if t['marking'] else {}
        questions = json.loads(t['questions']) if t['questions'] else []
        
        score = 0
        correct_count = 0
        incorrect_count = 0
        unanswered_count = 0
        maxScore = sum([q.get('marks',0) for q in questions])
        
        for q in questions:
            qid = q['id']
            ans = answers.get(qid)
            
            # Helper to check if answered
            is_ans = ans is not None and ans != '' and not (isinstance(ans, list) and len(ans) == 0)
            
            if not is_ans:
                unanswered_count += 1
                score -= marking.get('unanswered', 0)
                continue
            
            ok = False
            q_type = q.get('type')
            q_correct = q.get('correct', [])
            
            if q_type == 'mcq-single':
                ok = ans == (q_correct[0] if q_correct else None)
            elif q_type == 'mcq-multi':
                ok = sorted(ans) == sorted(q_correct)
            else:
                ok = ans.strip().lower() == (q_correct[0].strip().lower() if q_correct else '')
            
            if ok:
                correct_count += 1
                score += q.get('marks', 0)
            else:
                incorrect_count += 1
                score -= q.get('negMarks', 0)
                
        sub_id = uuid.uuid4().hex
        c.execute("""INSERT INTO submissions 
                     (id, testId, testTitle, rollNo, studentName, answers, score, maxScore, correct, incorrect, unanswered, total, timestamp)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                  (sub_id, test_id, t['title'], rollNo, data.get('studentName',''), json.dumps(answers),
                   score, maxScore, correct_count, incorrect_count, unanswered_count, len(questions), int(time.time()*1000)))
        conn.commit()
    
    return jsonify({
        "success": True, 
        "score": score, 
        "maxScore": maxScore,
        "correct": correct_count, 
        "incorrect": incorrect_count, 
        "unanswered": unanswered_count
    })

@app.route('/api/tests/<test_id>/solutions', methods=['GET'])
def get_solutions(test_id):
    rollNo = request.args.get('rollNo')
    # Make sure this student submitted the test
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT id FROM submissions WHERE testId=? AND rollNo=?", (test_id, rollNo))
        if not c.fetchone():
             return jsonify({"error": "Unauthorized"}), 403
             
        c.execute("SELECT questions, pdf_data FROM tests WHERE id=?", (test_id,))
        row = c.fetchone()
        if not row:
             return jsonify({"error": "Test not found"}), 404
             
        questions = json.loads(row['questions']) if row['questions'] else []
        pdf = row['pdf_data']
        
    return jsonify({"questions": questions, "pdf_data": pdf})


# --- Admin Extra APIs ---
@app.route('/api/admin/submissions', methods=['GET'])
def get_admin_submissions():
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM submissions")
        subs = []
        for row in c.fetchall():
            s = dict(row)
            s['answers'] = json.loads(s['answers']) if s['answers'] else {}
            subs.append(s)
            
        c.execute("SELECT * FROM students")
        students = [dict(r) for r in c.fetchall()]
        
    return jsonify({"submissions": subs, "students": students})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
