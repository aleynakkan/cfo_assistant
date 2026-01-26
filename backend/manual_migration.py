"""
Manual database migration via Cloud Run job.
Run this once after successful deployment.
"""

import os
import sys
from sqlalchemy import text, create_engine

def run_migration():
    """Run email ingestion table migration."""
    
    # Database connection from environment
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ DATABASE_URL environment variable not found")
        sys.exit(1)
    
    engine = create_engine(database_url)
    
    print("🚀 Running Email Ingestion Migration")
    print("=" * 50)
    
    try:
        with engine.connect() as connection:
            print("✅ Database connection successful")
            
            # Add source_id column to transactions if not exists
            print("Adding source_id column to transactions...")
            connection.execute(text("""
                ALTER TABLE transactions 
                ADD COLUMN IF NOT EXISTS source_id UUID NULL
            """))
            connection.commit()
            print("✅ source_id column added")
            
            # Add imported_at column to transactions if not exists  
            print("Adding imported_at column to transactions...")
            connection.execute(text("""
                ALTER TABLE transactions 
                ADD COLUMN IF NOT EXISTS imported_at TIMESTAMP NULL
            """))
            connection.commit()
            print("✅ imported_at column added")
            
            # Create email_aliases table
            print("Creating email_aliases table...")
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS email_aliases (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    original_email VARCHAR(255) NOT NULL,
                    alias_email VARCHAR(255) NOT NULL UNIQUE,
                    user_id INTEGER NOT NULL,
                    company_id INTEGER NOT NULL,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            connection.commit()
            print("✅ email_aliases table created")
            
            # Create email_ingest_logs table
            print("Creating email_ingest_logs table...")
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS email_ingest_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    to_email VARCHAR(255) NOT NULL,
                    from_email VARCHAR(255) NOT NULL,
                    subject VARCHAR(500),
                    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status VARCHAR(50) NOT NULL,
                    error_message TEXT,
                    user_id INTEGER,
                    company_id INTEGER,
                    attachments_count INTEGER DEFAULT 0,
                    transactions_created INTEGER DEFAULT 0
                )
            """))
            connection.commit()
            print("✅ email_ingest_logs table created")
            
            # Create email_attachments table
            print("Creating email_attachments table...")
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS email_attachments (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    email_log_id UUID NOT NULL,
                    filename VARCHAR(255) NOT NULL,
                    file_size INTEGER,
                    file_hash VARCHAR(255) UNIQUE,
                    detected_bank VARCHAR(100),
                    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status VARCHAR(50) NOT NULL,
                    error_message TEXT,
                    transactions_created INTEGER DEFAULT 0
                )
            """))
            connection.commit()
            print("✅ email_attachments table created")
            
            print("\n🎉 Migration completed successfully!")
            print("Email ingestion system is now ready!")
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_migration()