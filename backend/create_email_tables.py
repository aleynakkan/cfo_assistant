"""
Database migrations for email ingestion system.
Creates all necessary tables for production-grade email processing.
"""

import sys
import os
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

def create_tables():
    """Create all tables, including new email ingestion tables."""
    print("Creating database tables...")
    
    try:
        # This will create all tables defined in our models
        Base.metadata.create_all(bind=engine)
        print("✅ All tables created successfully!")
        print("\nNew tables added for email ingestion:")
        print("• email_aliases - User email alias mappings")
        print("• email_ingest_logs - Email processing audit trail") 
        print("• email_attachments - File processing with hash-based duplicate protection")
        print("\nExisting Transaction table updated with:")
        print("• source_id - UUID reference to email attachment")
        print("• imported_at - Timestamp of email processing")
        
    except Exception as e:
        print(f"❌ Error creating tables: {e}")
        raise

def check_tables():
    """Check if all tables exist."""
    print("\nChecking tables...")
    
    try:
        from sqlalchemy import inspect
        
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        
        expected_tables = [
            'users', 'companies', 'transactions',
            'planned_items', 'planned_item_schemas', 'planned_matches',
            'company_settings', 
            'email_aliases', 'email_ingest_logs', 'email_attachments'
        ]
        
        print(f"Existing tables: {sorted(existing_tables)}")
        
        missing_tables = [t for t in expected_tables if t not in existing_tables]
        if missing_tables:
            print(f"❌ Missing tables: {missing_tables}")
        else:
            print("✅ All expected tables exist!")
            
    except Exception as e:
        print(f"❌ Error checking tables: {e}")

if __name__ == "__main__":
    print("=== Email Ingestion Database Setup ===")
    create_tables()
    check_tables()
    print("\n🚀 Database is ready for email ingestion!")