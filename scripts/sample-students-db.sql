-- Schema and data for a normalized sample school database (100 students)
-- Run with: psql -d sample_students -v ON_ERROR_STOP=1 -f scripts/sample-students-db.sql
-- (create the database first via: createdb sample_students)

CREATE SCHEMA IF NOT EXISTS school;
SET search_path = school;

CREATE TABLE IF NOT EXISTS school.students (
  id SERIAL PRIMARY KEY,
  student_number TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  birth_date DATE NOT NULL,
  cohort_year SMALLINT NOT NULL,
  enrolled_at DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'alumni', 'leave'))
);

CREATE TABLE IF NOT EXISTS school.subjects (
  id SMALLSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  credit_hours SMALLINT NOT NULL CHECK (credit_hours BETWEEN 1 AND 6)
);

CREATE TABLE IF NOT EXISTS school.assessment_types (
  id SMALLSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS school.marks (
  id BIGSERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES school.students (id) ON DELETE CASCADE,
  subject_id SMALLINT NOT NULL REFERENCES school.subjects (id) ON DELETE CASCADE,
  assessment_type_id SMALLINT NOT NULL REFERENCES school.assessment_types (id),
  score NUMERIC(5, 2) NOT NULL CHECK (score >= 0 AND score <= 100),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  teacher_comments TEXT
);

TRUNCATE school.students, school.subjects, school.assessment_types, school.marks RESTART IDENTITY;

INSERT INTO school.subjects (code, name, department, credit_hours) VALUES
  ('MATH101', 'Calculus I', 'Mathematics', 4),
  ('ENG201', 'College Writing', 'Humanities', 3),
  ('SCI151', 'Introductory Physics', 'Sciences', 4),
  ('CS105', 'Programming Foundations', 'Computer Science', 3),
  ('HIST210', 'Modern World History', 'Social Studies', 3),
  ('ART130', 'Design Studio', 'Arts & Media', 2);

INSERT INTO school.assessment_types (code, description) VALUES
  ('EXAM', 'Summative exam covering the unit'),
  ('PROJECT', 'Capstone or lab project'),
  ('QUIZ', 'Short mastery check'),
  ('HOMEWORK', 'Homework / practice set');

INSERT INTO school.students (student_number, first_name, last_name, email, birth_date, cohort_year, enrolled_at, status)
SELECT
  format('S%03s', gs),
  format('First%03s', gs),
  format('Last%03s', gs),
  format('student%03s@example.edu', gs),
  date '2007-01-01' + ((gs * 13) % 365) * INTERVAL '1 day',
  2021 + (gs % 4),
  date '2021-08-01' + ((gs * 7) % 365) * INTERVAL '1 day',
  CASE
    WHEN gs % 13 = 0 THEN 'leave'
    WHEN gs % 10 = 0 THEN 'alumni'
    ELSE 'active'
  END
FROM generate_series(1, 100) AS gs;

INSERT INTO school.marks (student_id, subject_id, assessment_type_id, score, recorded_at, teacher_comments)
SELECT
  s.id,
  subj.id,
  ((s.id + subj.id) % 4) + 1,
  round((60 + random() * 40)::numeric, 2),
  NOW() - ((s.id + subj.id + ((s.id + subj.id) % 10)) * INTERVAL '1 day'),
  CASE WHEN random() < 0.2 THEN 'Needs attention on next checkpoint' ELSE 'Steady progress' END
FROM school.students s
CROSS JOIN school.subjects subj;

ALTER TABLE school.students OWNER TO CURRENT_USER;
ALTER TABLE school.subjects OWNER TO CURRENT_USER;
ALTER TABLE school.assessment_types OWNER TO CURRENT_USER;
ALTER TABLE school.marks OWNER TO CURRENT_USER;
