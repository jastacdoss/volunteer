-- Uncommon Men's Conference Schema
-- Run this in Supabase SQL Editor

-- Create the uncommon schema
CREATE SCHEMA IF NOT EXISTS uncommon;

-- ========================================
-- TEAMS TABLE
-- ========================================
CREATE TABLE uncommon.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(20) NOT NULL UNIQUE,
  color_hex VARCHAR(7) NOT NULL,
  display_order INTEGER NOT NULL,
  bonus_points INTEGER DEFAULT 0,
  leader_pco_id VARCHAR(50),
  leader_name VARCHAR(100),
  leader_email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default teams
INSERT INTO uncommon.teams (name, color_hex, display_order) VALUES
  ('RED', '#EF4444', 1),
  ('GREEN', '#22C55E', 2),
  ('BLUE', '#3B82F6', 3),
  ('YELLOW', '#EAB308', 4),
  ('ORANGE', '#F97316', 5),
  ('GREY', '#6B7280', 6);

-- ========================================
-- SMALL GROUPS TABLE
-- ========================================
CREATE TABLE uncommon.small_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  team_id UUID REFERENCES uncommon.teams(id),
  group_type VARCHAR(20) NOT NULL, -- 'adult', 'jh', 'hs'
  leader_pco_id VARCHAR(50),
  leader_name VARCHAR(100),
  leader_email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for team lookups
CREATE INDEX idx_small_groups_team ON uncommon.small_groups(team_id);

-- Insert default small groups (will be populated based on PCO locations)
-- Adults: 3 per team
INSERT INTO uncommon.small_groups (name, team_id, group_type)
SELECT
  t.name || '-' || n::text,
  t.id,
  'adult'
FROM uncommon.teams t
CROSS JOIN generate_series(1, 3) AS n;

-- Jr High: 1 per team
INSERT INTO uncommon.small_groups (name, team_id, group_type)
SELECT
  t.name || '-JH',
  t.id,
  'jh'
FROM uncommon.teams t;

-- High School: 1 per team
INSERT INTO uncommon.small_groups (name, team_id, group_type)
SELECT
  t.name || '-HS',
  t.id,
  'hs'
FROM uncommon.teams t;

-- ========================================
-- PARTICIPANTS TABLE
-- ========================================
CREATE TABLE uncommon.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pco_person_id VARCHAR(50),
  pco_checkin_id VARCHAR(50) UNIQUE,
  checkin_number INTEGER,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  location_name VARCHAR(50),
  team_id UUID REFERENCES uncommon.teams(id),
  small_group_id UUID REFERENCES uncommon.small_groups(id),
  checked_in_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX idx_participants_team ON uncommon.participants(team_id);
CREATE INDEX idx_participants_small_group ON uncommon.participants(small_group_id);
CREATE INDEX idx_participants_checkin_number ON uncommon.participants(checkin_number);
CREATE INDEX idx_participants_name ON uncommon.participants(LOWER(first_name), LOWER(last_name));
CREATE INDEX idx_participants_pco_person ON uncommon.participants(pco_person_id);

-- ========================================
-- MAN CARDS TABLE
-- ========================================
CREATE TABLE uncommon.man_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL UNIQUE REFERENCES uncommon.participants(id) ON DELETE CASCADE,
  black_marks INTEGER DEFAULT 0 CHECK (black_marks >= 0 AND black_marks <= 12),
  red_marks INTEGER DEFAULT 0 CHECK (red_marks >= 0 AND red_marks <= 12),
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for participant lookups
CREATE INDEX idx_man_cards_participant ON uncommon.man_cards(participant_id);

-- ========================================
-- TEAM POINTS LOG TABLE
-- ========================================
CREATE TABLE uncommon.team_points_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES uncommon.teams(id),
  points INTEGER NOT NULL,
  reason VARCHAR(255),
  entered_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_team_points_log_team ON uncommon.team_points_log(team_id);

-- ========================================
-- DRAWINGS TABLE
-- ========================================
CREATE TABLE uncommon.drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES uncommon.participants(id),
  prize_name VARCHAR(255),
  drawn_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_drawings_participant ON uncommon.drawings(participant_id);
CREATE INDEX idx_drawings_drawn_at ON uncommon.drawings(drawn_at DESC);

-- ========================================
-- VIEW: Team Scores (computed)
-- ========================================
CREATE OR REPLACE VIEW uncommon.team_scores AS
SELECT
  t.id as team_id,
  t.name as team_name,
  t.color_hex,
  t.display_order,
  t.bonus_points as team_bonus,
  t.leader_name as team_leader,
  COUNT(DISTINCT p.id) as participant_count,
  COALESCE(SUM(mc.black_marks), 0)::INTEGER as total_black_marks,
  COALESCE(SUM(mc.red_marks), 0)::INTEGER as total_red_marks,
  COALESCE(SUM(CASE WHEN mc.completed THEN 5 ELSE 0 END), 0)::INTEGER as completion_bonuses,
  COALESCE((SELECT SUM(points) FROM uncommon.team_points_log WHERE team_id = t.id), 0)::INTEGER as points_log_total,
  (
    COALESCE(SUM(mc.black_marks), 0) +
    COALESCE(SUM(mc.red_marks), 0) * 2 +
    COALESCE(SUM(CASE WHEN mc.completed THEN 5 ELSE 0 END), 0) +
    t.bonus_points +
    COALESCE((SELECT SUM(points) FROM uncommon.team_points_log WHERE team_id = t.id), 0)
  )::INTEGER as total_score
FROM uncommon.teams t
LEFT JOIN uncommon.participants p ON p.team_id = t.id
LEFT JOIN uncommon.man_cards mc ON mc.participant_id = p.id
GROUP BY t.id, t.name, t.color_hex, t.display_order, t.bonus_points, t.leader_name
ORDER BY total_score DESC, t.display_order;

-- ========================================
-- VIEW: Drawing Pool (eligible participants)
-- ========================================
CREATE OR REPLACE VIEW uncommon.drawing_pool AS
SELECT
  p.id as participant_id,
  p.first_name,
  p.last_name,
  p.checkin_number,
  t.name as team_name,
  t.color_hex,
  mc.red_marks
FROM uncommon.participants p
JOIN uncommon.teams t ON p.team_id = t.id
JOIN uncommon.man_cards mc ON mc.participant_id = p.id
WHERE mc.red_marks > 0
  AND p.id NOT IN (SELECT participant_id FROM uncommon.drawings);

-- ========================================
-- VIEW: Small Group Counts
-- ========================================
CREATE OR REPLACE VIEW uncommon.small_group_counts AS
SELECT
  sg.id as small_group_id,
  sg.name as group_name,
  sg.group_type,
  t.name as team_name,
  t.color_hex,
  sg.leader_name,
  COUNT(p.id)::INTEGER as participant_count
FROM uncommon.small_groups sg
JOIN uncommon.teams t ON sg.team_id = t.id
LEFT JOIN uncommon.participants p ON p.small_group_id = sg.id
GROUP BY sg.id, sg.name, sg.group_type, t.name, t.color_hex, t.display_order, sg.leader_name
ORDER BY sg.group_type, t.display_order, sg.name;
