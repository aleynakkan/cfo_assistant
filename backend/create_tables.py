"""
Script to create all database tables without data migration.
This will create the schema based on SQLAlchemy models.
"""
from app.core.database import Base, engine
from app.models.user import User
from app.models.company import Company
from app.models.transaction import Transaction
from app.models.planned_item import PlannedCashflowItem
from app.models.planned_match import PlannedMatch
from app.models.company_settings import CompanyFinancialSettings

def create_tables():
    """Create all tables defined in SQLAlchemy models"""
    print("Creating database tables...")
    print(f"Database URL: {engine.url}")
    
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    print("✓ All tables created successfully!")
    print("\nCreated tables:")
    for table in Base.metadata.sorted_tables:
        print(f"  - {table.name}")

if __name__ == "__main__":
    create_tables()
