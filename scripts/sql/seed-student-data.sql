-- Sample database objects to exercise PostgreSQL MCP tooling
-- Creates students, subjects, and marks tables plus 100 students with randomized marks.

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  grade_level INT NOT NULL CHECK (grade_level BETWEEN 1 AND 12),
  enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE - (floor(random() * 365))::INT
);

CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS marks (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  exam_date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- Populate subjects once
INSERT INTO subjects (name, description)
VALUES
  ('Mathematics', 'Foundational numeracy, algebra, and geometry'),
  ('English', 'Reading comprehension, writing, and literature'),
  ('Science', 'Life, physical and earth sciences'),
  ('History', 'World, national, and civic history'),
  ('Computer Science', 'Problem solving and programming concepts')
ON CONFLICT (name) DO NOTHING;

-- Add 100 students (name + grade)
INSERT INTO students (name, grade_level)
SELECT
  format('Student %s', g) AS name,
  ((g - 1) % 12) + 1 AS grade_level
FROM generate_series(1, 100) g
ON CONFLICT (name) DO NOTHING;

-- Assign 3 random marks per student
WITH chosen_subjects AS (
  SELECT
    s.id AS student_id,
    sub.id AS subject_id
  FROM students s
  CROSS JOIN LATERAL (
    SELECT id FROM subjects ORDER BY random() LIMIT 3
  ) sub
)
INSERT INTO marks (student_id, subject_id, score, exam_date)
SELECT
  student_id,
  subject_id,
  (floor(random() * 41) + 60)::INT,
  CURRENT_DATE - (floor(random() * 30))::INT
FROM chosen_subjects
ON CONFLICT DO NOTHING;
