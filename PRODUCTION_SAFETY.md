# 🛡️ Production Data Safety Guidelines

## 🚨 Critical Rules

### ❌ **NEVER DO:**
1. **Manual migration commands with ENV=production locally**
2. **Copy production data to local environment**  
3. **Run migration scripts without checking ENV variable**
4. **Use production DATABASE_URL in local .env file**

### ✅ **ALWAYS DO:**
1. **Check ENV variable before any database operation**
2. **Use separate test data for local development**
3. **Run migrations only through Cloud Build pipelines**
4. **Verify database connection before critical operations**

## 🔒 Environment Separation

### Local Development
```bash
ENV=local                    # Default, no need to set
Database: SQLite            # cfo_assistant.db
Path: backend/cfo_assistant.db
```

### Production
```yaml
ENV: production             # Set by Cloud Run
Database: PostgreSQL        # Cloud SQL
Connection: Via Secret Manager
```

## 🛠️ Safe Development Workflow

### 1. **Local Development**
```bash
# ✅ Safe - uses local SQLite
python main.py

# ✅ Auto-creates test data locally  
python migrate_counterparty.py
```

### 2. **Production Deploy**
```bash
# ✅ Safe - triggers Cloud Build
git push origin main

# ✅ Safe - only runs in cloud environment
gcloud builds submit --config cloudbuild.yaml
```

### 3. **Production Migrations**
```bash
# ✅ Safe - isolated cloud environment
gcloud builds submit --config cloudbuild-migrate.yaml
```

## 🚨 Emergency: Data Mixed

If local test data accidentally went to production:

### 1. **Immediate Stop**
```bash
# Stop any running processes
gcloud run services update cfo-backend --region=us-central1 --no-traffic
```

### 2. **Clean Production Data** 
```sql
-- Connect to clean production database directly
DELETE FROM planned_cashflow_items WHERE source = 'manual';  
DELETE FROM transactions WHERE description LIKE '%TEST%';
-- Be very careful with this!
```

### 3. **Restore Clean State**
```bash
# Redeploy with clean migrations only
gcloud builds submit --config cloudbuild.yaml
```

## 📋 Pre-Deploy Checklist

- [ ] ✅ ENV variable is correctly set in Cloud Run
- [ ] ✅ Local database contains only test data
- [ ] ✅ No production secrets in local environment
- [ ] ✅ Migration scripts verified for production safety
- [ ] ✅ Database backup taken before major changes

## 🔧 Safety Enhancements Added

### Database Connection Logging
```python
if ENV == "production":
    print("🏭 PRODUCTION: Connecting to PostgreSQL...")
else:
    print("🔧 LOCAL: Using SQLite at {db_path}")
```

### Environment Validation
- Clear environment detection
- Mandatory DATABASE_URL for production
- Automatic local SQLite path calculation
- Connection safety guards

**Remember: Production data is precious. Always double-check environment before database operations!** 🎯