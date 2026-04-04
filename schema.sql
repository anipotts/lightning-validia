-- OpenProof Postgres Schema
-- Run this on Lightning AI Studio's Postgres instance

CREATE TABLE IF NOT EXISTS threat_events (
    id              SERIAL PRIMARY KEY,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- The raw input from the user
    input_text      TEXT NOT NULL,

    -- Validia Ghost validation result
    verdict         VARCHAR(20) NOT NULL CHECK (verdict IN ('safe', 'suspicious', 'likely_attack', 'blocked')),
    threat_score    FLOAT NOT NULL CHECK (threat_score >= 0.0 AND threat_score <= 1.0),

    -- Attack classification
    attack_category VARCHAR(50),  -- e.g. 'cot_elicitation', 'capability_mapping', etc.
    subcategory     VARCHAR(50),

    -- Detection signals that fired (stored as JSON array)
    signals         JSONB DEFAULT '[]',

    -- What happened after validation
    action_taken    VARCHAR(20) NOT NULL CHECK (action_taken IN ('allowed', 'warned', 'deflected', 'blocked')),

    -- The agent's response (null if blocked)
    output_text     TEXT,

    -- Session tracking for meta-signal detection (high volume, template reuse, etc.)
    session_id      VARCHAR(64)
);

-- Index for dashboard queries
CREATE INDEX idx_threat_events_created_at ON threat_events (created_at DESC);
CREATE INDEX idx_threat_events_verdict ON threat_events (verdict);
CREATE INDEX idx_threat_events_category ON threat_events (attack_category);
CREATE INDEX idx_threat_events_session ON threat_events (session_id);

-- View for Kapil's dashboard stats
CREATE VIEW dashboard_stats AS
SELECT
    COUNT(*) AS total_events,
    COUNT(*) FILTER (WHERE verdict = 'safe') AS safe_count,
    COUNT(*) FILTER (WHERE verdict = 'suspicious') AS suspicious_count,
    COUNT(*) FILTER (WHERE verdict = 'likely_attack') AS likely_attack_count,
    COUNT(*) FILTER (WHERE verdict = 'blocked') AS blocked_count,
    AVG(threat_score) AS avg_threat_score
FROM threat_events
WHERE created_at > NOW() - INTERVAL '1 hour';

-- View for per-category breakdown
CREATE VIEW category_breakdown AS
SELECT
    attack_category,
    COUNT(*) AS count,
    AVG(threat_score) AS avg_score
FROM threat_events
WHERE attack_category IS NOT NULL
GROUP BY attack_category
ORDER BY count DESC;
