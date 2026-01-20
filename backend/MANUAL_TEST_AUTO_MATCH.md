# Auto-Match Feature - Manual Test Guide

## Test Scenarios

### Prerequisites
1. Backend running: `uvicorn main:app --reload --host 127.0.0.1 --port 8000`
2. Valid user credentials for authentication

### Scenario 1: Reference-based exact match

**Setup:**
```bash
# 1. Login and get token
curl -X POST http://localhost:8000/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=YOUR_USER&password=YOUR_PASS"

# Save the access_token from response as TOKEN

# 2. Create planned item with reference_no
curl -X POST http://localhost:8000/planned/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INVOICE",
    "direction": "in",
    "amount": 1000.00,
    "due_date": "2026-01-18",
    "counterparty": "Test Corp",
    "reference_no": "INV-123"
  }'

# Save the planned item id from response (e.g., "abc-123")

# 3. Create matching transaction
curl -X POST http://localhost:8000/transactions/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-01-16",
    "description": "Payment for INV-123 from customer",
    "amount": 1000.00,
    "direction": "in"
  }'

# Save transaction id (e.g., "tx-456")
```

**Verification:**
```bash
# Check planned item matches
curl -X GET http://localhost:8000/planned/abc-123/matches \
  -H "Authorization: Bearer TOKEN"

# Expected: 1 match with match_type="AUTO", matched_amount=1000.00

# Check transaction matches
curl -X GET http://localhost:8000/transactions/tx-456/matches \
  -H "Authorization: Bearer TOKEN"

# Expected: 1 match with match_type="AUTO"

# Check planned item status
curl -X GET http://localhost:8000/planned/ \
  -H "Authorization: Bearer TOKEN"

# Expected: planned item should have status="SETTLED", remaining_amount=0.00
```

### Scenario 2: Amount-based match (no reference_no)

**Setup:**
```bash
# Create planned item without reference_no
curl -X POST http://localhost:8000/planned/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INVOICE",
    "direction": "out",
    "amount": 500.50,
    "due_date": "2026-01-20",
    "counterparty": "Vendor XYZ"
  }'

# Create matching transaction (within 7 days, same amount, same direction)
curl -X POST http://localhost:8000/transactions/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-01-18",
    "description": "Payment to Vendor XYZ",
    "amount": 500.50,
    "direction": "out"
  }'
```

**Expected:** Auto-match should be created.

### Scenario 3: No match - amount mismatch

**Setup:**
```bash
# Create planned item
curl -X POST http://localhost:8000/planned/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INVOICE",
    "direction": "in",
    "amount": 750.00,
    "due_date": "2026-01-19"
  }'

# Create transaction with different amount
curl -X POST http://localhost:8000/transactions/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-01-17",
    "description": "Payment",
    "amount": 750.01,
    "direction": "in"
  }'
```

**Expected:** NO auto-match (amounts differ by 0.01).

### Scenario 4: No match - date window exceeded

**Setup:**
```bash
# Create planned item
curl -X POST http://localhost:8000/planned/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INVOICE",
    "direction": "in",
    "amount": 300.00,
    "due_date": "2026-01-10"
  }'

# Create transaction more than 7 days away
curl -X POST http://localhost:8000/transactions/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-01-20",
    "description": "Late payment",
    "amount": 300.00,
    "direction": "in"
  }'
```

**Expected:** NO auto-match (date difference > 7 days).

### Scenario 5: Idempotency check

**Setup:**
```bash
# Create the same transaction twice (should fail on second attempt or be ignored)
curl -X POST http://localhost:8000/transactions/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-01-16",
    "description": "Duplicate test INV-999",
    "amount": 100.00,
    "direction": "in"
  }'

# Try creating again
curl -X POST http://localhost:8000/transactions/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-01-16",
    "description": "Duplicate test INV-999",
    "amount": 100.00,
    "direction": "in"
  }'
```

**Expected:** Second transaction may be created (different id) but should NOT create duplicate match.

### Scenario 6: Ambiguous match (multiple candidates)

**Setup:**
```bash
# Create two planned items with same amount, direction, and equidistant dates
curl -X POST http://localhost:8000/planned/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INVOICE",
    "direction": "in",
    "amount": 250.00,
    "due_date": "2026-01-13"
  }'

curl -X POST http://localhost:8000/planned/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INVOICE",
    "direction": "in",
    "amount": 250.00,
    "due_date": "2026-01-17"
  }'

# Create transaction exactly in the middle
curl -X POST http://localhost:8000/transactions/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-01-15",
    "description": "Payment",
    "amount": 250.00,
    "direction": "in"
  }'
```

**Expected:** NO auto-match (ambiguous - both are 2 days away). Check backend logs for "AMBIGUOUS" warning.

### Scenario 7: CSV Upload with auto-match

**Setup:**
Create a CSV file `test_upload.csv`:
```csv
date,description,amount,direction
2026-01-16,Payment INV-TEST-1,150.00,in
2026-01-17,Vendor payment,75.50,out
```

Before uploading, create matching planned items:
```bash
curl -X POST http://localhost:8000/planned/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INVOICE",
    "direction": "in",
    "amount": 150.00,
    "due_date": "2026-01-18",
    "reference_no": "INV-TEST-1"
  }'
```

Upload CSV:
```bash
curl -X POST http://localhost:8000/transactions/upload-csv \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@test_upload.csv"
```

**Expected:** Transaction with "INV-TEST-1" should auto-match with planned item.

## Checking Logs

View backend logs for auto-match activity:
```bash
# In the terminal running uvicorn, look for:
# - "Auto-match: Found X initial candidates for tx..."
# - "Auto-match candidate selected: tx ... -> planned ..."
# - "Auto-match SUCCESS: created match_id=..."
# - "Auto-match AMBIGUOUS for tx ..." (for ambiguous scenarios)
```

## Quick Verification Queries

```bash
# List all matches
curl -X GET http://localhost:8000/matches \
  -H "Authorization: Bearer TOKEN"

# List all planned items
curl -X GET http://localhost:8000/planned/ \
  -H "Authorization: Bearer TOKEN"

# List all transactions
curl -X GET http://localhost:8000/transactions/ \
  -H "Authorization: Bearer TOKEN"
```
