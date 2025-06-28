-- Aurora Global Database Setup Script
-- This script configures the primary database for global replication

-- Enable logical replication for specific tables
ALTER SYSTEM SET wal_level = logical;
ALTER SYSTEM SET max_replication_slots = 10;
ALTER SYSTEM SET max_wal_senders = 10;

-- Create replication user
CREATE USER replication_user WITH REPLICATION ENCRYPTED PASSWORD 'secure_replication_password';
GRANT USAGE ON SCHEMA public TO replication_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO replication_user;

-- Create publication for all tables
CREATE PUBLICATION musicconnect_global FOR ALL TABLES;

-- Performance optimization for global database
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements,auto_explain';
ALTER SYSTEM SET pg_stat_statements.track = all;
ALTER SYSTEM SET auto_explain.log_min_duration = '1s';

-- Connection pooling settings
ALTER SYSTEM SET max_connections = 1000;
ALTER SYSTEM SET shared_buffers = '25GB';
ALTER SYSTEM SET effective_cache_size = '75GB';
ALTER SYSTEM SET maintenance_work_mem = '2GB';
ALTER SYSTEM SET work_mem = '256MB';

-- Write-ahead log settings for replication
ALTER SYSTEM SET wal_buffers = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET max_wal_size = '4GB';
ALTER SYSTEM SET min_wal_size = '1GB';

-- Query optimization
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;
ALTER SYSTEM SET default_statistics_target = 100;

-- Vacuum settings
ALTER SYSTEM SET autovacuum_max_workers = 10;
ALTER SYSTEM SET autovacuum_naptime = '10s';
ALTER SYSTEM SET autovacuum_vacuum_scale_factor = 0.01;
ALTER SYSTEM SET autovacuum_analyze_scale_factor = 0.005;

-- Create monitoring schema
CREATE SCHEMA IF NOT EXISTS monitoring;

-- Replication lag monitoring function
CREATE OR REPLACE FUNCTION monitoring.get_replication_lag()
RETURNS TABLE (
    application_name TEXT,
    client_addr INET,
    state TEXT,
    sent_lsn PG_LSN,
    write_lsn PG_LSN,
    flush_lsn PG_LSN,
    replay_lsn PG_LSN,
    write_lag INTERVAL,
    flush_lag INTERVAL,
    replay_lag INTERVAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.application_name,
        s.client_addr,
        s.state,
        s.sent_lsn,
        s.write_lsn,
        s.flush_lsn,
        s.replay_lsn,
        s.write_lag,
        s.flush_lag,
        s.replay_lag
    FROM pg_stat_replication s;
END;
$$ LANGUAGE plpgsql;

-- Create partition management for large tables
CREATE OR REPLACE FUNCTION create_monthly_partitions(table_name TEXT, start_date DATE, end_date DATE)
RETURNS VOID AS $$
DECLARE
    curr_date DATE;
    partition_name TEXT;
    start_range DATE;
    end_range DATE;
BEGIN
    curr_date := start_date;
    
    WHILE curr_date < end_date LOOP
        start_range := curr_date;
        end_range := curr_date + INTERVAL '1 month';
        partition_name := table_name || '_' || TO_CHAR(curr_date, 'YYYY_MM');
        
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I PARTITION OF %I
            FOR VALUES FROM (%L) TO (%L)',
            partition_name, table_name, start_range, end_range
        );
        
        curr_date := end_range;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Apply partitioning to high-volume tables
-- User activity logs
CREATE TABLE user_activity_logs (
    id BIGSERIAL,
    user_id UUID NOT NULL,
    action VARCHAR(255) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL,
    region VARCHAR(50) NOT NULL
) PARTITION BY RANGE (created_at);

-- Create partitions for the next 12 months
SELECT create_monthly_partitions('user_activity_logs', CURRENT_DATE, CURRENT_DATE + INTERVAL '12 months');

-- Content views tracking
CREATE TABLE content_views (
    id BIGSERIAL,
    content_id UUID NOT NULL,
    user_id UUID,
    viewed_at TIMESTAMP NOT NULL,
    duration_seconds INTEGER,
    region VARCHAR(50) NOT NULL
) PARTITION BY RANGE (viewed_at);

SELECT create_monthly_partitions('content_views', CURRENT_DATE, CURRENT_DATE + INTERVAL '12 months');

-- Create indexes for partitioned tables
CREATE INDEX idx_user_activity_logs_user_id ON user_activity_logs (user_id);
CREATE INDEX idx_user_activity_logs_created_at ON user_activity_logs (created_at);
CREATE INDEX idx_content_views_content_id ON content_views (content_id);
CREATE INDEX idx_content_views_viewed_at ON content_views (viewed_at);

-- Regional read replica routing view
CREATE OR REPLACE VIEW monitoring.regional_endpoints AS
SELECT 
    'us-east-1' AS region,
    'aurora-us-east-1.cluster-ro-abc123.us-east-1.rds.amazonaws.com' AS read_endpoint,
    'aurora-us-east-1.cluster-abc123.us-east-1.rds.amazonaws.com' AS write_endpoint
UNION ALL
SELECT 
    'us-west-2' AS region,
    'aurora-us-west-2.cluster-ro-def456.us-west-2.rds.amazonaws.com' AS read_endpoint,
    'aurora-us-east-1.cluster-abc123.us-east-1.rds.amazonaws.com' AS write_endpoint
UNION ALL
SELECT 
    'eu-west-1' AS region,
    'aurora-eu-west-1.cluster-ro-ghi789.eu-west-1.rds.amazonaws.com' AS read_endpoint,
    'aurora-us-east-1.cluster-abc123.us-east-1.rds.amazonaws.com' AS write_endpoint
UNION ALL
SELECT 
    'ap-southeast-1' AS region,
    'aurora-ap-southeast-1.cluster-ro-jkl012.ap-southeast-1.rds.amazonaws.com' AS read_endpoint,
    'aurora-us-east-1.cluster-abc123.us-east-1.rds.amazonaws.com' AS write_endpoint;

-- Failover procedures
CREATE OR REPLACE FUNCTION monitoring.initiate_failover(target_region TEXT)
RETURNS VOID AS $$
BEGIN
    -- Log failover event
    INSERT INTO monitoring.failover_events (initiated_at, target_region, initiated_by)
    VALUES (NOW(), target_region, CURRENT_USER);
    
    -- Signal application to switch write endpoint
    PERFORM pg_notify('failover_channel', json_build_object(
        'action', 'failover',
        'target_region', target_region,
        'timestamp', NOW()
    )::text);
END;
$$ LANGUAGE plpgsql;

-- Create failover events table
CREATE TABLE IF NOT EXISTS monitoring.failover_events (
    id SERIAL PRIMARY KEY,
    initiated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    target_region VARCHAR(50) NOT NULL,
    initiated_by VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'initiated',
    error_message TEXT
);

-- Reload configuration
SELECT pg_reload_conf();