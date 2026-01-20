#!/usr/bin/env python3
"""
Fix inconsistent planned item statuses:
- settled_amount = 0 but status = PARTIAL → set to OPEN
- remaining_amount <= 0.005 but status != SETTLED → set to SETTLED
"""

from app.core.database import SessionLocal
from app.models.planned_item import PlannedCashflowItem
from sqlalchemy import and_

db = SessionLocal()

try:
    # Fix 1: settled = 0 but status = PARTIAL → OPEN
    items_to_fix_1 = db.query(PlannedCashflowItem).filter(
        and_(
            PlannedCashflowItem.settled_amount == 0,
            PlannedCashflowItem.status == "PARTIAL"
        )
    ).all()
    
    for item in items_to_fix_1:
        print(f"Fixing {item.id}: settled=0 PARTIAL → OPEN")
        item.status = "OPEN"
    
    # Fix 2: remaining <= 0.005 but status != SETTLED → SETTLED
    items_to_fix_2 = db.query(PlannedCashflowItem).filter(
        and_(
            PlannedCashflowItem.remaining_amount <= 0.005,
            PlannedCashflowItem.status != "SETTLED"
        )
    ).all()
    
    for item in items_to_fix_2:
        print(f"Fixing {item.id}: remaining={item.remaining_amount} {item.status} → SETTLED")
        item.status = "SETTLED"
    
    if items_to_fix_1 or items_to_fix_2:
        db.commit()
        print(f"\n✅ Fixed {len(items_to_fix_1) + len(items_to_fix_2)} items")
    else:
        print("✅ No inconsistencies found")

except Exception as e:
    print(f"❌ Error: {e}")
    db.rollback()
finally:
    db.close()
