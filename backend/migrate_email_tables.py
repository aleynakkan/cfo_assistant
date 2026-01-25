"""
Production database migration script for Cloud Run deployment.
This script will be run in the Cloud Run environment where database access is available.
"""

import sys
import os
from sqlalchemy import text

# Add the parent directory to the path to import app modules
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.core.database import engine, Base
from app.models import (
    # Existing models
    user, company, transaction, 
    planned_item, planned_item_schema, planned_match,
    company_settings,
    # New email models
    email_alias, email_ingest_log, email_attachment
)

def check_and_add_transaction_columns():
    """Add new columns to existing transaction table if they don't exist."""
    print("Checking transaction table for new email columns...")
    
    try:
        with engine.connect() as connection:
            # Check if source_id column exists
            result = connection.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'transactions' 
                AND column_name = 'source_id'
            """))
            
            if not result.fetchone():
                print("Adding source_id column to transactions table...")
                connection.execute(text("""
                    ALTER TABLE transactions 
                    ADD COLUMN source_id UUID NULL
                """))
                connection.commit()
                print("✅ source_id column added")
            else:
                print("✅ source_id column already exists")
            
            # Check if imported_at column exists
            result = connection.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'transactions' 
                AND column_name = 'imported_at'
            """))
            
            if not result.fetchone():
                print("Adding imported_at column to transactions table...")
                connection.execute(text("""
                    ALTER TABLE transactions 
                    ADD COLUMN imported_at TIMESTAMP NULL
                """))
                connection.commit()
                print("✅ imported_at column added")
            else:
                print("✅ imported_at column already exists")
                
    except Exception as e:
        print(f"❌ Error updating transaction table: {e}")
        raise

def create_email_tables():
    """Create new email ingestion tables."""
    print("Creating new email ingestion tables...")
    
    try:
        # Create only the new email tables
        from app.models.email_alias import EmailAlias
        from app.models.email_ingest_log import EmailIngestLog  
        from app.models.email_attachment import EmailAttachment
        
        EmailAlias.__table__.create(bind=engine, checkfirst=True)
        print("✅ email_aliases table created")
        
        EmailIngestLog.__table__.create(bind=engine, checkfirst=True)
        print("✅ email_ingest_logs table created")
        
        EmailAttachment.__table__.create(bind=engine, checkfirst=True)
        print("✅ email_attachments table created")
        
    except Exception as e:
        print(f"❌ Error creating email tables: {e}")
        raise

def verify_tables():
    """Verify all tables exist."""
    print("Verifying all tables...")
    
    try:
        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            """))
            
            tables = [row[0] for row in result.fetchall()]
            print(f"Existing tables: {tables}")
            
            required_tables = [
                'email_aliases', 'email_ingest_logs', 'email_attachments'
            ]
            
            missing = [t for t in required_tables if t not in tables]
            if missing:
                print(f"❌ Missing tables: {missing}")
                return False
            else:
                print("✅ All email ingestion tables exist")
                return True
                
    except Exception as e:
        print(f"❌ Error verifying tables: {e}")
        return False

def main():
    """Run database migration."""
    print("🚀 Starting Email Ingestion Database Migration")
    print("=" * 50)
    
    try:
        # Step 1: Update existing transaction table
        check_and_add_transaction_columns()
        
        # Step 2: Create new email tables
        create_email_tables()
        
        # Step 3: Verify everything
        if verify_tables():
            print("\n✅ Database migration completed successfully!")
            print("\nEmail ingestion system is ready!")
        else:
            print("\n❌ Migration verification failed")
            
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()