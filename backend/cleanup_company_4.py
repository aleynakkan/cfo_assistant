# Cleanup script: delete all data for company_id=4
from sqlalchemy.orm import Session
from app.core.database import engine, SessionLocal
from app.models.planned_match import PlannedMatch
from app.models.planned_item import PlannedCashflowItem
from app.models.transaction import Transaction

COMPANY_ID = 4

def cleanup_company_data(company_id: int):
    db = SessionLocal()
    
    try:
        # Count records before deletion
        match_count = db.query(PlannedMatch).filter(PlannedMatch.company_id == company_id).count()
        planned_count = db.query(PlannedCashflowItem).filter(PlannedCashflowItem.company_id == company_id).count()
        tx_count = db.query(Transaction).filter(Transaction.company_id == company_id).count()
        
        print(f"Company ID {company_id} için silinecek kayıtlar:")
        print(f"  - Planned Matches: {match_count}")
        print(f"  - Planned Items: {planned_count}")
        print(f"  - Transactions: {tx_count}")
        print(f"  - TOPLAM: {match_count + planned_count + tx_count}")
        
        # Confirm deletion
        confirm = input("\nSilmeyi onaylıyor musunuz? (evet/hayır): ").strip().lower()
        if confirm != "evet":
            print("İşlem iptal edildi.")
            return
        
        # Delete in order: matches first, then planned items and transactions
        db.query(PlannedMatch).filter(PlannedMatch.company_id == company_id).delete()
        print(f"✓ {match_count} planned match silindi")
        
        db.query(PlannedCashflowItem).filter(PlannedCashflowItem.company_id == company_id).delete()
        print(f"✓ {planned_count} planned item silindi")
        
        db.query(Transaction).filter(Transaction.company_id == company_id).delete()
        print(f"✓ {tx_count} transaction silindi")
        
        db.commit()
        print("\n✓ Tüm veriler başarıyla silindi!")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Hata: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    print(f"Company ID {COMPANY_ID} için veri temizliği başlıyor...\n")
    cleanup_company_data(COMPANY_ID)
