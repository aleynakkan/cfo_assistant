"""
Email Ingestion Service - Core service for processing incoming emails.
Handles user identification, file processing, and transaction creation.
"""

import os
import tempfile
import logging
from typing import Optional, Dict, List
from datetime import datetime
from unittest import result
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..models.email_alias import EmailAlias
from ..models.email_ingest_log import EmailIngestLog
from ..models.email_attachment import EmailAttachment
from ..models.transaction import Transaction
from ..models.company import Company
from .bank_detector import bank_detector

logger = logging.getLogger(__name__)

class EmailIngestionService:
    """Main service for processing incoming emails with Excel attachments.
    Delegates file processing to bank-specific upload endpoints.
    """
    
    def __init__(self):
        self.temp_dir = tempfile.gettempdir()
        self.bank_detector = bank_detector
    
    async def process_incoming_email(
        self,
        db: Session,
        to_email: str,
        from_email: Optional[str] = None,
        subject: Optional[str] = None,
        attachments: List[UploadFile] = None
    ) -> Dict:
        """
        Process an incoming email with attachments.
        
        Args:
            db: Database session
            to_email: Recipient email (ingestion@cfoseyfo.com)
            from_email: Sender email (user's registered email)
            subject: Email subject
            attachments: List of file attachments
            
        Returns:
            Processing results
        """
        # Create email log
        email_log = EmailIngestLog(
            to_email=to_email,
            from_email=from_email,
            subject=subject,
            status='PENDING'
        )
        db.add(email_log)
        db.commit()
        db.refresh(email_log)
        
        try:
            # Identify user and company from sender email
            user_info = self._get_user_from_sender(db, from_email)
            if not user_info:
                raise HTTPException(
                    status_code=400,
                    detail=f"No user found for sender email: {from_email}"
                )
            email_log.user_id = user_info["user_id"]
            email_log.company_id = user_info["company_id"]
            email_log.status = 'PROCESSING'
            db.commit()
            
            # Process attachments
            results = []
            if attachments:
                for attachment in attachments:
                    if self._is_excel_file(attachment.filename):
                        result = await self._process_attachment(
                            db, email_log, attachment, user_info["company_id"]
                        )
                        results.append(result)
            
            # Update final status
            if results and any(r["success"] for r in results):
                email_log.status = 'SUCCESS'
                email_log.processed_at = datetime.now()
            else:
                email_log.status = 'FAILED'
                email_log.error_message = "No Excel attachments processed successfully"
            
            db.commit()
            
            return {
                "status": "success" if email_log.status == 'SUCCESS' else "failed",
                "email_log_id": str(email_log.id),
                "user_id": user_info["user_id"],
                "company_id": user_info["company_id"],
                "attachments_processed": len([r for r in results if r["success"]]),
                "total_transactions": sum(r.get("transactions_count", 0) for r in results),
                "results": results
            }
            
        except Exception as e:
            email_log.status = 'FAILED'
            email_log.error_message = str(e)
            db.commit()
            logger.error(f"Error processing email {email_log.id}: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    async def _process_attachment(
        self,
        db: Session,
        email_log: EmailIngestLog,
        attachment: UploadFile,
        company_id: int
    ) -> Dict:
        """Process a single Excel attachment."""
        temp_file_path = None
        
        try:
            # Save file temporarily
            temp_file_path = await self._save_temp_file(attachment)
            
            # Calculate file hash and check for duplicates
            file_hash = self._calculate_file_hash(temp_file_path)
            
            existing_attachment = db.query(EmailAttachment).filter(
                EmailAttachment.file_hash == file_hash
            ).first()
            
            if existing_attachment:
                return {
                    "success": False,
                    "filename": attachment.filename,
                    "error": "Duplicate file - already processed",
                    "existing_attachment_id": str(existing_attachment.id)
                }
            
            # Create attachment record
            attachment_record = EmailAttachment(
                email_log_id=email_log.id,
                filename=attachment.filename or "unknown.xlsx",
                file_hash=file_hash,
                status='UPLOADED'
            )
            db.add(attachment_record)
            db.commit()
            db.refresh(attachment_record)
            
            # Detect bank from filename
            detected_bank = self.bank_detector.detect_bank_from_filename(attachment.filename)
            attachment_record.detected_bank = detected_bank
            db.commit()
            
            # Get company for this attachment
            company = db.query(Company).filter(Company.id == company_id).first()
            if not company:
                raise HTTPException(status_code=404, detail="Company not found")
            
            # Reset file position and delegate to bank-specific endpoint
            await attachment.seek(0)
            
            # Call appropriate bank upload endpoint
            upload_result = await self._delegate_to_bank_endpoint(
                db, detected_bank, attachment, company
            )
            
            if not upload_result["success"]:
                attachment_record.status = 'FAILED'
                attachment_record.error_message = upload_result.get("error", "Processing failed")
                db.commit()
                return {
                    "success": False,
                    "filename": attachment.filename,
                    "error": upload_result.get("error", "Processing failed")
                }
            
            # Update attachment with processing results
            attachment_record.status = 'PROCESSED'
            attachment_record.processed_at = datetime.now()
            attachment_record.transactions_count = upload_result.get("transaction_count", 0)
            db.commit()
            
            return {
                "success": True,
                "filename": attachment.filename,
                "attachment_id": str(attachment_record.id),
                "detected_bank": detected_bank,
                "bank_name": upload_result.get("bank_name", detected_bank.upper()),
                "transactions_count": upload_result.get("transaction_count", 0)
            }
            
        except Exception as e:
            logger.error(f"Error processing attachment {attachment.filename}: {str(e)}")
            return {
                "success": False,
                "filename": attachment.filename,
                "error": str(e)
            }
        
        finally:
            # Cleanup temporary file
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                except Exception as e:
                    logger.warning(f"Failed to cleanup temp file {temp_file_path}: {str(e)}")
    
    async def _save_temp_file(self, file: UploadFile) -> str:
        """Save uploaded file to temporary location."""
        import uuid
        from pathlib import Path
        
        file_extension = Path(file.filename or "file.xlsx").suffix
        temp_filename = f"email_attachment_{uuid.uuid4()}{file_extension}"
        temp_file_path = os.path.join(self.temp_dir, temp_filename)
        
        content = await file.read()
        with open(temp_file_path, "wb") as temp_file:
            temp_file.write(content)
        
        return temp_file_path
    
    def _calculate_file_hash(self, file_path: str) -> str:
        """Calculate SHA-256 hash of file."""
        import hashlib
        sha256_hash = hashlib.sha256()
        
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        
        return sha256_hash.hexdigest()
    
    async def _delegate_to_bank_endpoint(
        self,
        db: Session,
        detected_bank: str,
        attachment: UploadFile,
        company: Company
    ) -> Dict:
        """Delegate file processing to bank-specific upload endpoint."""
        from ..routes.transactions import upload_enpara_excel, upload_akbank_excel, upload_yapikredi_excel
        
        try:
            await attachment.seek(0)
            
            if detected_bank == "enpara":
                result = await upload_enpara_excel(file=attachment, db=db, current_company=company)
                result_dict = result.dict() if hasattr(result, 'dict') else result
                return {
            "success": True,
            "bank_name": "Enpara",
            "transaction_count": result_dict.get("inserted", 0)
}
            
            elif detected_bank == "akbank":
                result = await upload_akbank_excel(file=attachment, db=db, current_company=company)
                return {
                    "success": True,
                    "bank_name": "Akbank",
                    "transaction_count": result.get("transaction_count", 0)
                }
            
            elif detected_bank == "yapikredi":
                result = await upload_yapikredi_excel(file=attachment, db=db, current_company=company)
                return {
                    "success": True,
                    "bank_name": "Yapı Kredi",
                    "transaction_count": result.get("transaction_count", 0)
                }
            
            else:
                return {
                    "success": False,
                    "error": f"Unsupported bank: {detected_bank}"
                }
        
        except Exception as e:
            logger.error(f"Error in bank endpoint delegation for {detected_bank}: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _get_user_from_sender(self, db: Session, sender_email: str) -> Optional[Dict]:
        """Get user and company info from sender email."""
        from ..models.user import User
        from ..models.company import Company
        user_record = db.query(User).filter(
            User.email == sender_email,
            User.is_active == True
        ).first()
        if not user_record:
            return None
        # Find company where user is owner
        company = db.query(Company).filter(Company.owner_id == user_record.id).first()
        company_id = company.id if company else None
        return {
            "user_id": user_record.id,
            "company_id": company_id,
            "original_email": user_record.email
        }
    
    def _is_excel_file(self, filename: Optional[str]) -> bool:
        """Check if file is an Excel file."""
        if not filename:
            return False
        
        excel_extensions = ['.xlsx', '.xls', '.xlsm', '.xltx', '.xltm']
        return any(filename.lower().endswith(ext) for ext in excel_extensions)
    
    # Email alias creation is no longer used in the new workflow
    
    def rollback_email_transactions(
        self,
        db: Session,
        attachment_id: str
    ) -> Dict:
        """Rollback all transactions created from a specific email attachment."""
        try:
            # Delete transactions
            deleted_count = db.query(Transaction).filter(
                Transaction.source == "EMAIL",
                Transaction.source_id == attachment_id
            ).delete()
            
            # Update attachment status
            attachment = db.query(EmailAttachment).filter(
                EmailAttachment.id == attachment_id
            ).first()
            
            if attachment:
                attachment.status = 'ROLLED_BACK'
                attachment.transactions_count = 0
            
            db.commit()
            
            return {
                "success": True,
                "transactions_deleted": deleted_count,
                "attachment_id": attachment_id
            }
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error rolling back transactions for {attachment_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

# Singleton instance
email_ingestion_service = EmailIngestionService()