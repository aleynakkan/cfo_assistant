"""
Migration: Add password reset token columns to users table.
Run locally or via Cloud Run job for production.
"""

import os
import sys
from sqlalchemy import text, create_engine


def run_migration():
    """Add reset_token and reset_token_expires columns to users table."""

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ DATABASE_URL environment variable not found")
        sys.exit(1)

    engine = create_engine(database_url)

    print("🚀 Running Password Reset Migration")
    print("=" * 50)

    try:
        with engine.connect() as connection:
            print("✅ Database connection successful")

            # Add reset_token column
            print("Adding reset_token column to users...")
            try:
                connection.execute(text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR"
                ))
                print("  ✅ reset_token column added")
            except Exception as e:
                print(f"  ⚠️ reset_token: {e}")

            # Add reset_token_expires column
            print("Adding reset_token_expires column to users...")
            try:
                connection.execute(text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP"
                ))
                print("  ✅ reset_token_expires column added")
            except Exception as e:
                print(f"  ⚠️ reset_token_expires: {e}")

            # Create index on reset_token for fast lookup
            print("Creating index on reset_token...")
            try:
                connection.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_users_reset_token ON users (reset_token)"
                ))
                print("  ✅ Index created")
            except Exception as e:
                print(f"  ⚠️ Index: {e}")

            connection.commit()

        print("=" * 50)
        print("✅ Migration completed successfully!")

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    run_migration()
