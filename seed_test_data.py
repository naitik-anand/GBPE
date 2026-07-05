import sqlite3, json, time

DB_FILE = 'quizforge.db'


def main():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # Reset
    c.execute('DELETE FROM submissions')
    c.execute('DELETE FROM tests')
    c.execute('DELETE FROM students')
    conn.commit()

    # Insert 5 roll-number test accounts with no googleUid on file. The
    # backend now requires a verified Google token to log in *only* when a
    # student record has a googleUid saved — these seeded accounts have
    # none, so they intentionally stay easy to log into for local testing.
    now = int(time.time() * 1000)
    students = [
        ('240001', 'Student One'),
        ('240002', 'Student Two'),
        ('240003', 'Student Three'),
        ('240004', 'Student Four'),
        ('240005', 'Student Five'),
    ]
    for roll, name in students:
        c.execute(
            """INSERT INTO students (rollNo, name, dob, googleEmail, googleUid, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (roll, name, '2000-01-01', '', '', now),
        )

    # Default marking scheme
    marking = {'correct': 4, 'incorrect': 1, 'unanswered': 0}

    # Two simple active tests
    t1_id = 't_admin_test_1'
    qs1 = [
        {
            'id': 'q1',
            'type': 'mcq-single',
            'text': 'Which is 2+2?',
            'options': [
                {'id': 'a1', 'text': '3'},
                {'id': 'a2', 'text': '4'},
                {'id': 'a3', 'text': '5'},
                {'id': 'a4', 'text': '22'},
            ],
            'correct': ['a2'],
            'marks': 4,
            'negMarks': 1,
            'solution': 'Answer is 4.',
        },
        {
            'id': 'q2',
            'type': 'short',
            'text': 'Capital of France?',
            'options': [],
            'correct': ['Paris'],
            'marks': 4,
            'negMarks': 1,
            'solution': 'Paris is the capital of France.',
        },
    ]

    t2_id = 't_admin_test_2'
    qs2 = [
        {
            'id': 'q3',
            'type': 'mcq-multi',
            'text': 'Select prime numbers:',
            'options': [
                {'id': 'b1', 'text': '2'},
                {'id': 'b2', 'text': '4'},
                {'id': 'b3', 'text': '5'},
                {'id': 'b4', 'text': '6'},
            ],
            'correct': ['b1', 'b3'],
            'marks': 4,
            'negMarks': 1,
            'solution': 'Primes among these are 2 and 5.',
        },
        {
            'id': 'q4',
            'type': 'long',
            'text': 'Write 1 sentence about the Sun.',
            'options': [],
            'correct': ['The Sun is a star.'],
            'marks': 4,
            'negMarks': 1,
            'solution': 'A simple correct idea is that the Sun is a star.',
        },
    ]

    c.execute(
        """INSERT INTO tests (id, title, description, duration, active, marking, questions, pdf_data, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (t1_id, 'Admin Quick Test 1', 'For rollout testing', 20, 1, json.dumps(marking), json.dumps(qs1), '', now),
    )

    c.execute(
        """INSERT INTO tests (id, title, description, duration, active, marking, questions, pdf_data, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (t2_id, 'Admin Quick Test 2', 'Second rollout test', 20, 1, json.dumps(marking), json.dumps(qs2), '', now),
    )

    conn.commit()
    conn.close()

    print('Seeded: 5 students + 2 active tests (and cleared submissions/tests/students).')


if __name__ == '__main__':
    main()

