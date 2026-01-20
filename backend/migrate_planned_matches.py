# One-off migration: drop and recreate planned_matches with TEXT FKs
from sqlalchemy import text
from app.core.database import engine, db_path

SQL = [
    "DROP TABLE IF EXISTS planned_matches;",
    """
    CREATE TABLE planned_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        planned_item_id TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        matched_amount NUMERIC(18,2) NOT NULL,
        match_type TEXT NOT NULL DEFAULT 'MANUAL',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT uq_planned_match_unique UNIQUE(company_id, planned_item_id, transaction_id),
        FOREIGN KEY(planned_item_id) REFERENCES planned_cashflow_items(id),
        FOREIGN KEY(transaction_id) REFERENCES transactions(id)
    );
    """
]

def main():
    print(f"Using database: {db_path}")
    with engine.begin() as conn:
        for stmt in SQL:
            conn.execute(text(stmt))
    print("planned_matches table recreated successfully.")

if __name__ == "__main__":
    main()
