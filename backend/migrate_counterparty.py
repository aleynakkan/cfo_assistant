"""
Manual database migration for Counterparty Intelligence feature.
Safe, backward-compatible, idempotent (IF NOT EXISTS guards).
Run once per environment.

Usage:
  Local (SQLite):  Tables created automatically by create_all in main.py startup.
                   Run this script only for backfill.
  Production (PG): python migrate_counterparty.py
"""

import os
import sys
import re
import unicodedata
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()


def normalize_counterparty_name(name: str) -> str:
    """Normalize a counterparty name for deduplication."""
    if not name:
        return ""
    # Unicode normalize
    name = unicodedata.normalize("NFKD", name)
    # Lowercase
    name = name.lower().strip()
    # Remove punctuation except spaces
    name = re.sub(r"[^\w\s]", "", name)
    # Collapse whitespace
    name = re.sub(r"\s+", " ", name).strip()
    return name


def run_migration():
    """Run counterparty table migration + backfill."""

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

    print("🚀 Counterparty Intelligence Migration")
    print("=" * 50)

    with engine.connect() as conn:
        print("✅ Database connection OK")

        # ── 1) Create counterparties table ──
        if ENV == "production":
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS counterparties (
                    id SERIAL PRIMARY KEY,
                    company_id INTEGER NOT NULL REFERENCES companies(id),
                    name VARCHAR(255) NOT NULL,
                    normalized_name VARCHAR(255) NOT NULL,
                    type VARCHAR(50) NOT NULL DEFAULT 'OTHER',
                    notes TEXT,
                    is_active BOOLEAN NOT NULL DEFAULT true,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT uq_counterparty_company_name UNIQUE (company_id, normalized_name)
                )
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_counterparty_company ON counterparties(company_id)
            """))
            conn.commit()
            print("✅ counterparties table created (PostgreSQL)")

            # ── 2) Create counterparty_aliases table ──
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS counterparty_aliases (
                    id SERIAL PRIMARY KEY,
                    counterparty_id INTEGER NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,
                    company_id INTEGER NOT NULL REFERENCES companies(id),
                    alias VARCHAR(500) NOT NULL,
                    normalized_alias VARCHAR(500) NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT uq_alias_company_normalized UNIQUE (company_id, normalized_alias)
                )
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_alias_counterparty ON counterparty_aliases(counterparty_id)
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_alias_company ON counterparty_aliases(company_id)
            """))
            conn.commit()
            print("✅ counterparty_aliases table created (PostgreSQL)")

            # ── 3) Add FK columns to existing tables ──
            conn.execute(text("""
                ALTER TABLE planned_cashflow_items
                ADD COLUMN IF NOT EXISTS counterparty_id INTEGER REFERENCES counterparties(id)
            """))
            conn.commit()
            print("✅ planned_cashflow_items.counterparty_id added")

            conn.execute(text("""
                ALTER TABLE transactions
                ADD COLUMN IF NOT EXISTS counterparty_id INTEGER REFERENCES counterparties(id)
            """))
            conn.commit()
            print("✅ transactions.counterparty_id added")

        else:
            # SQLite: create_all handles table creation; just need backfill
            # But let's ensure columns exist for SQLite too
            try:
                conn.execute(text("SELECT counterparty_id FROM planned_cashflow_items LIMIT 1"))
            except Exception:
                try:
                    conn.execute(text("ALTER TABLE planned_cashflow_items ADD COLUMN counterparty_id INTEGER"))
                    conn.commit()
                    print("✅ planned_cashflow_items.counterparty_id added (SQLite)")
                except Exception:
                    pass

            try:
                conn.execute(text("SELECT counterparty_id FROM transactions LIMIT 1"))
            except Exception:
                try:
                    conn.execute(text("ALTER TABLE transactions ADD COLUMN counterparty_id INTEGER"))
                    conn.commit()
                    print("✅ transactions.counterparty_id added (SQLite)")
                except Exception:
                    pass

        # ── 4) Backfill: create counterparties from distinct planned_cashflow_items.counterparty ──
        print("\n📊 Backfill: extracting distinct counterparty names...")

        rows = conn.execute(text("""
            SELECT DISTINCT company_id, counterparty
            FROM planned_cashflow_items
            WHERE counterparty IS NOT NULL AND counterparty != ''
        """)).fetchall()

        created = 0
        skipped = 0
        linked = 0

        for row in rows:
            company_id = row[0]
            raw_name = row[1]
            normalized = normalize_counterparty_name(raw_name)

            if not normalized:
                skipped += 1
                continue

            # Check if already exists
            existing = conn.execute(text("""
                SELECT id FROM counterparties
                WHERE company_id = :cid AND normalized_name = :norm
            """), {"cid": company_id, "norm": normalized}).fetchone()

            if existing:
                cp_id = existing[0]
                skipped += 1
            else:
                if ENV == "production":
                    result = conn.execute(text("""
                        INSERT INTO counterparties (company_id, name, normalized_name, type)
                        VALUES (:cid, :name, :norm, 'OTHER')
                        RETURNING id
                    """), {"cid": company_id, "name": raw_name.strip(), "norm": normalized})
                    cp_id = result.fetchone()[0]
                else:
                    conn.execute(text("""
                        INSERT INTO counterparties (company_id, name, normalized_name, type)
                        VALUES (:cid, :name, :norm, 'OTHER')
                    """), {"cid": company_id, "name": raw_name.strip(), "norm": normalized})
                    result = conn.execute(text("SELECT last_insert_rowid()"))
                    cp_id = result.fetchone()[0]
                created += 1

            # Link planned items that have this counterparty text
            conn.execute(text("""
                UPDATE planned_cashflow_items
                SET counterparty_id = :cpid
                WHERE company_id = :cid
                  AND counterparty = :raw
                  AND counterparty_id IS NULL
            """), {"cpid": cp_id, "cid": company_id, "raw": raw_name})
            linked += 1

        conn.commit()

        print(f"✅ Backfill complete: {created} created, {skipped} skipped, {linked} groups linked")

    print("\n🎉 Counterparty migration finished!")


if __name__ == "__main__":
    run_migration()
