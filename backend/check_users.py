"""
Script to query users from the database.
"""
from app.core.database import SessionLocal
from app.models.user import User
from app.models.company import Company

def check_users():
    """Check all users in the database"""
    db = SessionLocal()
    try:
        users = db.query(User).all()
        print(f"Total users in database: {len(users)}")
        print("\nUsers:")
        for user in users:
            print(f"  ID: {user.id}")
            print(f"  Email: {user.email}")
            print(f"  Company ID: {user.company_id}")
            print(f"  Created: {user.created_at}")
            print("  ---")
        
        companies = db.query(Company).all()
        print(f"\nTotal companies: {len(companies)}")
        for company in companies:
            print(f"  ID: {company.id}, Name: {company.name}")
            
    finally:
        db.close()

if __name__ == "__main__":
    check_users()
