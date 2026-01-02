-- Ivanti AI Extension Database Schema
-- For PostgreSQL (recommended) or MySQL
-- Run this script to create the necessary tables for learning and analytics

-- ============================================
-- CONVERSATION HISTORY
-- Stores all user-AI interactions for context
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_history (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    message_role VARCHAR(20) NOT NULL CHECK (message_role IN ('user', 'assistant')),
    message_content TEXT NOT NULL,
    ticket_id VARCHAR(50),
    intent VARCHAR(50),
    resolved BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_conversation_user_email ON conversation_history(user_email);
CREATE INDEX IF NOT EXISTS idx_conversation_session_id ON conversation_history(session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_timestamp ON conversation_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_user_session ON conversation_history(user_email, session_id);

-- ============================================
-- USER PATTERNS & PREFERENCES
-- Tracks user behavior patterns for personalization
-- ============================================
CREATE TABLE IF NOT EXISTS user_patterns (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    common_intent VARCHAR(50) NOT NULL,
    frequency INTEGER DEFAULT 1,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    preferences JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_email, common_intent)
);

CREATE INDEX IF NOT EXISTS idx_user_patterns_email ON user_patterns(user_email);
CREATE INDEX IF NOT EXISTS idx_user_patterns_frequency ON user_patterns(frequency DESC);

-- ============================================
-- SOLVED ISSUES
-- Records successful problem resolutions for learning
-- ============================================
CREATE TABLE IF NOT EXISTS solved_issues (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    issue_description TEXT NOT NULL,
    solution TEXT NOT NULL,
    kb_article_id VARCHAR(50),
    issue_type VARCHAR(50), -- authentication, hardware, email, network, software, etc.
    solved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success_rating INTEGER CHECK (success_rating BETWEEN 1 AND 5),
    user_feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_solved_issues_email ON solved_issues(user_email);
CREATE INDEX IF NOT EXISTS idx_solved_issues_type ON solved_issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_solved_issues_date ON solved_issues(solved_at DESC);

-- ============================================
-- KB ARTICLE PERFORMANCE
-- Tracks which KB articles are most helpful
-- ============================================
CREATE TABLE IF NOT EXISTS kb_performance (
    id SERIAL PRIMARY KEY,
    kb_article_id VARCHAR(50) NOT NULL,
    kb_article_title VARCHAR(500),
    times_used INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 0.00,
    last_used TIMESTAMP,
    user_feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(kb_article_id)
);

CREATE INDEX IF NOT EXISTS idx_kb_performance_usage ON kb_performance(times_used DESC);
CREATE INDEX IF NOT EXISTS idx_kb_performance_success ON kb_performance(success_rate DESC);

-- ============================================
-- DISCOVERY CACHE
-- Caches Ivanti discovery data (Categories, Priorities, Offerings)
-- ============================================
CREATE TABLE IF NOT EXISTS discovery_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(100) NOT NULL UNIQUE,
    cache_data JSONB NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_cache_key ON discovery_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_discovery_cache_expires ON discovery_cache(expires_at);

-- ============================================
-- WORKFLOW PERFORMANCE METRICS
-- Tracks workflow execution times and performance
-- ============================================
CREATE TABLE IF NOT EXISTS workflow_metrics (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255),
    intent VARCHAR(50),
    execution_time_ms INTEGER,
    nodes_executed INTEGER,
    cache_hit BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_metrics_timestamp ON workflow_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_metrics_intent ON workflow_metrics(intent);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get recent conversation history for a user
CREATE OR REPLACE FUNCTION get_user_conversation_history(
    p_user_email VARCHAR(255),
    p_session_id VARCHAR(255),
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    message_role VARCHAR(20),
    message_content TEXT,
    timestamp TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ch.message_role,
        ch.message_content,
        ch.timestamp
    FROM conversation_history ch
    WHERE ch.user_email = p_user_email
      AND ch.session_id = p_session_id
    ORDER BY ch.timestamp DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's most common intents
CREATE OR REPLACE FUNCTION get_user_patterns(
    p_user_email VARCHAR(255),
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    common_intent VARCHAR(50),
    frequency INTEGER,
    last_used TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        up.common_intent,
        up.frequency,
        up.last_used
    FROM user_patterns up
    WHERE up.user_email = p_user_email
    ORDER BY up.frequency DESC, up.last_used DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to clean old cache entries
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM discovery_cache
    WHERE expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SAMPLE QUERIES FOR ANALYTICS
-- ============================================

-- Get most common issues
-- SELECT issue_type, COUNT(*) as count 
-- FROM solved_issues 
-- GROUP BY issue_type 
-- ORDER BY count DESC;

-- Get most helpful KB articles
-- SELECT kb_article_title, times_used, success_rate 
-- FROM kb_performance 
-- ORDER BY success_rate DESC, times_used DESC 
-- LIMIT 10;

-- Get user's conversation history
-- SELECT * FROM get_user_conversation_history('user@example.com', 'session123', 20);

-- Get user patterns
-- SELECT * FROM get_user_patterns('user@example.com', 5);

