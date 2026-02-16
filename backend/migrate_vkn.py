"""
Manual database migration: Add VKN (Vergi Kimlik No) column to counterparties.
Safe, backward-compatible, idempotent (IF NOT EXISTS / column-exists guards).

Changes:
  - ADD COLUMN vkn VARCHAR(10) NULLABLE to counterparties
  - ADD UNIQUE CONSTRAINT (company_id, vkn)

Usage:
  Local (SQLite):  Tables created automatically by create_all in main.py startup.
                   Run this script only if DB already exists without the column.
  Production (PG): python migrate_vkn.py
"""

import os
import sys
from sqlalchemy import create_engine, text, inspect
from dotenv import load_dotenv

load_dotenv()


def column_exists(conn, table: str, column: str, engine) -> bool:
    """Check if a column exists in a table (works for both PG and SQLite)."""
    insp = inspect(engine)
    columns = [c["name"] for c in insp.get_columns(table)]
    return column in columns


def run_migration():
    ENV = os.getenv("ENV", "local")

    if ENV == "production":
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            print("❌ DATABASE_URL not set")
            sys.exit(1)
        engine = create_engine(database_url)
    else:
        db_dir = os.path.dirname(os.path.abspath(__file__))
        db_path = os.path.join(db_dir, "cfo_assistant.db")
        database_url = f"sqlite:///{db_path}"
        engine = create_engine(database_url, connect_args={"check_same_thread": False})

    print("🚀 VKN Column Migration")
    print("=" * 50)

    with engine.connect() as conn:
        print("✅ Database connection OK")

        # Check if column already exists
        if column_exists(conn, "counterparties", "vkn", engine):
            print("ℹ️  counterparties.vkn column already exists — skipping ADD COLUMN")
        else:
            if ENV == "production":
                conn.execute(text("""
                    ALTER TABLE counterparties
                    ADD COLUMN IF NOT EXISTS vkn VARCHAR(10)
                """))
            else:
                conn.execute(text("""
                    ALTER TABLE counterparties ADD COLUMN vkn VARCHAR(10)
                """))
            conn.commit()
            print("✅ counterparties.vkn column added")

        # Add unique constraint (company_id, vkn)
        if ENV == "production":
            # PostgreSQL: use IF NOT EXISTS via DO block
            conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'uq_counterparty_company_vkn'
                    ) THEN
                        ALTER TABLE counterparties
                        ADD CONSTRAINT uq_counterparty_company_vkn
                        UNIQUE (company_id, vkn);
                    END IF;
                END$$;
            """))
            conn.commit()
            print("✅ Unique constraint (company_id, vkn) added (PostgreSQL)")
        else:
            # SQLite: unique constraint is enforced via CREATE UNIQUE INDEX
            try:
                conn.execute(text("""
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_counterparty_company_vkn
                    ON counterparties(company_id, vkn)
                """))
                conn.commit()
                print("✅ Unique index (company_id, vkn) added (SQLite)")
            except Exception as e:
                print(f"ℹ️  Unique index may already exist: {e}")

    print("\n🎉 VKN migration finished!")
    print("Note: VKN is nullable — existing counterparties are unaffected.")
    print("Backfill VKN data manually or via the API /counterparties/{id} PUT endpoint.")


if __name__ == "__main__":
    run_migration()
