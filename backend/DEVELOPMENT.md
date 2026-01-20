# CFO Assistant Backend - Development Guide

## Auto-Matching Feature

### Overview
The system automatically matches newly created transactions with planned cashflow items based on strict rules. This eliminates manual matching for obvious correspondences.

### Auto-Match Rules

When a transaction is created (via manual entry, CSV upload, or Excel upload), the system attempts to find a matching planned cashflow item:

1. **Exact Amount Match** (STRICT)
   - `transaction.amount` must **exactly** equal `planned_item.remaining_amount`
   - No tolerance or rounding - must be identical to the cent
   - Uses Decimal comparison for precision

2. **Direction Match** (STRICT)
   - `transaction.direction` must equal `planned_item.direction`
   - Both must be either "in" or "out"

3. **Date Window** (±7 days)
   - Transaction date must be within 7 days of planned item's due date
   - Formula: `|transaction.date - planned_item.due_date| <= 7 days`

4. **Status Filter**
   - Only considers planned items with status: `OPEN`, `PARTIAL`, or `SETTLED`
   - Ignores `CANCELLED` items

5. **Reference-First Priority**
   - If `planned_item.reference_no` is non-empty AND appears as substring in `transaction.description`
   - Those candidates are prioritized over non-reference matches
   - Case-sensitive substring match

6. **Ambiguity Handling**
   - If multiple candidates qualify after reference filtering
   - System picks the one with nearest `due_date` to transaction date
   - **If two or more have equal date distance → NO auto-match**
   - Logs warning and skips to avoid incorrect matches

7. **Idempotency**
   - Checks if match already exists before creating
   - Prevents duplicate matches on retry/re-upload

### Match Creation

When a match is created:
- `PlannedMatch` record inserted with:
  - `match_type = "AUTO"`
  - `matched_amount = transaction.amount`
  - `company_id = transaction.company_id`
- Automatically calls `recompute_planned_status()` to update:
  - `settled_amount`
  - `remaining_amount`
  - `status` (OPEN → PARTIAL → SETTLED)

### Trigger Points

Auto-matching runs immediately after transaction persistence in:

1. **Manual Transaction Creation**
   - `POST /transactions/`
   - After `db.commit()` and `db.refresh(tx)`

2. **CSV Upload**
   - `POST /transactions/upload-csv`
   - After each transaction insert (inside loop)

3. **Excel Uploads**
   - `POST /transactions/upload-akbank-excel`
   - `POST /transactions/upload-enpara-excel`
   - `POST /transactions/upload-yapikredi-excel`
   - After each transaction commit (inside loop)

### Code Location

- **Service:** `backend/app/services/auto_match.py`
- **Function:** `auto_match_transaction(db: Session, tx: Transaction, company_id: int) -> list`
- **Integration:** `backend/app/routes/transactions.py` (5 call sites)

### Logging

The auto-match service logs at multiple levels:

- **DEBUG:**
  - Candidate counts at each filter stage
  - Date window filtering results
  - Reference match results

- **INFO:**
  - Successful match creation with IDs
  - Selected candidate details

- **WARNING:**
  - Ambiguous scenarios (multiple equal-distance candidates)
  - IntegrityError on duplicate attempts

- **ERROR:**
  - Unexpected exceptions during commit

### Testing

See `MANUAL_TEST_AUTO_MATCH.md` for comprehensive test scenarios including:
- Reference-based matching
- Amount-only matching
- Edge cases (mismatch, date window, ambiguity)
- Idempotency checks
- CSV upload integration

### Performance Considerations

- Query uses indexed fields: `company_id`, `direction`, `remaining_amount`
- Date filtering done in Python (not SQL) for simplicity
- Single commit per transaction (already batched in upload flows)
- No N+1 queries - candidates fetched once per transaction

### Future Enhancements

- Add `AUTO_MATCH_ENABLED` environment variable to disable feature
- Configurable date window (currently hardcoded to 7 days)
- Support for partial matching (split transactions)
- Match confidence scoring
- User notification of auto-matches

### Troubleshooting

**No match created when expected:**
1. Check logs for "Auto-match: No candidates" messages
2. Verify amount is **exactly** equal (check for rounding differences)
3. Confirm date is within ±7 days
4. Check planned item status (must be OPEN/PARTIAL/SETTLED)

**Ambiguous match warning:**
- Multiple planned items have same amount, direction, and equidistant dates
- Add `reference_no` to planned items or adjust dates to disambiguate

**Duplicate match errors:**
- Idempotency protection working correctly
- Check if transaction was uploaded multiple times

### Database Schema

No schema changes required. Uses existing tables:
- `transactions` (source)
- `planned_cashflow_items` (target)
- `planned_matches` (junction table with `match_type` field)
