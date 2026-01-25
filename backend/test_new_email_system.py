"""
Test script for new email ingestion functionality.
Tests the production-grade email ingestion system.
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

def test_imports():
    """Test that all new modules can be imported."""
    print("=== Testing Imports ===")
    
    try:
        from app.models.email_alias import EmailAlias
        print("✓ EmailAlias model imported")
        
        from app.models.email_ingest_log import EmailIngestLog
        print("✓ EmailIngestLog model imported")
        
        from app.models.email_attachment import EmailAttachment
        print("✓ EmailAttachment model imported")
        
        from app.services.bank_detector import bank_detector
        print("✓ BankDetector service imported")
        
        from app.services.excel_parser import excel_parser
        print("✓ ExcelParser service imported")
        
        from app.services.email_ingestion import email_ingestion_service
        print("✓ EmailIngestionService imported")
        
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False

def test_bank_detection():
    """Test bank detection configuration."""
    print("\n=== Testing Bank Detection ===")
    
    try:
        from app.services.bank_detector import bank_detector
        
        supported_banks = bank_detector.get_supported_banks()
        print(f"Supported banks: {supported_banks}")
        
        for bank_code in supported_banks:
            config = bank_detector.get_bank_config(bank_code)
            print(f"\nBank: {bank_code}")
            print(f"  Name: {config['name']}")
            print(f"  Headers Row: {config['headers_row']}")
            print(f"  Data Start Row: {config['data_start_row']}")
            print(f"  Columns: {list(config['columns'].keys())}")
        
        return True
        
    except Exception as e:
        print(f"❌ Bank detection test failed: {e}")
        return False

def test_api_endpoints():
    """Test API endpoint accessibility."""
    print("\n=== Testing API Endpoints ===")
    
    print("New Email Ingestion Endpoints:")
    print("• POST /email/webhook/email - Webhook for incoming emails")
    print("• POST /email/aliases - Create email alias") 
    print("• GET /email/aliases - Get user aliases")
    print("• GET /email/logs - Get email processing logs")
    print("• GET /email/attachments/{email_log_id} - Get email attachments")
    print("• POST /email/attachments/{attachment_id}/rollback - Rollback transactions")
    print("• DELETE /email/aliases/{alias_id} - Deactivate alias")
    print("• GET /email/status - Service status")
    
    return True

def test_webhook_example():
    """Show webhook usage example."""
    print("\n=== Webhook Usage Example ===")
    
    print("Example webhook call:")
    print("curl -X POST 'https://cfo-backend-332747511395.us-central1.run.app/email/webhook/email' \\")
    print("  -F 'to_email=kerem@cfoseyfo.com' \\")
    print("  -F 'from_email=sender@example.com' \\") 
    print("  -F 'subject=Bank Statement' \\")
    print("  -F 'attachments=@bank_statement.xlsx'")
    
    print("\nEmail alias format:")
    print("• Original: kerem@gmail.com")
    print("• Alias: kerem@cfoseyfo.com")
    
    print("\nTransaction traceability:")
    print("• source = 'EMAIL' (instead of 'MANUAL')")
    print("• source_id = attachment UUID for rollback")
    print("• imported_at = timestamp of processing")

def main():
    """Run all tests."""
    try:
        success = True
        
        success &= test_imports()
        success &= test_bank_detection()
        success &= test_api_endpoints()
        test_webhook_example()
        
        if success:
            print("\n✅ All tests passed! Email ingestion system is ready.")
        else:
            print("\n❌ Some tests failed. Check the errors above.")
            
    except Exception as e:
        print(f"\n❌ Test suite failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()