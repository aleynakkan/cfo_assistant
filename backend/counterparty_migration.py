"""
Migration: Add counterparty_id to transactions table
Fix production database schema mismatch
"""

import os
import sys
from sqlalchemy import text, create_engine

def run_counterparty_migration():
    """Add missing counterparty_id column to transactions and planned_cashflow_items tables."""
    
    # Database connection from environment
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ DATABASE_URL environment variable not found")
        sys.exit(1)
    
    engine = create_engine(database_url)
    
    print("🚀 Running Counterparty Migration")
    print("=" * 50)
    
    try:
        with engine.connect() as connection:
            print("✅ Database connection successful")
            
            # Add counterparty_id column to transactions if not exists
            print("Adding counterparty_id column to transactions...")
            connection.execute(text("""
                ALTER TABLE transactions 
                ADD COLUMN IF NOT EXISTS counterparty_id INTEGER NULL 
                REFERENCES counterparties(id)
            """))
            connection.commit()
            print("✅ counterparty_id column added to transactions")
            
            # Add counterparty_id column to planned_cashflow_items if not exists
            print("Adding counterparty_id column to planned_cashflow_items...")
            connection.execute(text("""
                ALTER TABLE planned_cashflow_items 
                ADD COLUMN IF NOT EXISTS counterparty_id INTEGER NULL 
                REFERENCES counterparties(id)
            """))
            connection.commit()
            print("✅ counterparty_id column added to planned_cashflow_items")
            
            # Add indexes for performance
            print("Adding indexes...")
            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_transactions_counterparty_id 
                ON transactions(counterparty_id)
            """))
            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_planned_cashflow_items_counterparty_id 
                ON planned_cashflow_items(counterparty_id)
            """))
            connection.commit()
            print("✅ indexes created")
            
            # Add external_id column to transactions if not exists (might be missing too)  
            print("Adding external_id column to transactions...")
            connection.execute(text("""
                ALTER TABLE transactions 
                ADD COLUMN IF NOT EXISTS external_id VARCHAR(255) NULL
            """))
            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_transactions_external_id 
                ON transactions(external_id)
            """))
            connection.commit()
            print("✅ external_id column added to transactions")
            
            print("\n🎉 Counterparty migration completed successfully!")
            print("All table schemas are now up to date!")
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        print(f"Error details: {type(e).__name__}: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    run_counterparty_migration()