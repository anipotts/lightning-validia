CREATE TABLE IF NOT EXISTS threat_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    input_text TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('safe', 'suspicious', 'likely_attack', 'blocked')),
    threat_score REAL NOT NULL CHECK (threat_score >= 0.0 AND threat_score <= 1.0),
    attack_category TEXT,
    subcategory TEXT,
    signals TEXT DEFAULT '[]',
    action_taken TEXT NOT NULL CHECK (action_taken IN ('allowed', 'warned', 'deflected', 'blocked')),
    output_text TEXT,
    session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_threat_events_created_at ON threat_events (created_at);
CREATE INDEX IF NOT EXISTS idx_threat_events_verdict ON threat_events (verdict);
CREATE INDEX IF NOT EXISTS idx_threat_events_category ON threat_events (attack_category);
