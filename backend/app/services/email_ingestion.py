"""
Email Ingestion Service - Core service for processing incoming emails.
Handles user identification, file processing, and transaction creation.
"""

import os
import tempfile
import logging
from typing import Optional, Dict, List
from datetime import datetime
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..models.email_alias import EmailAlias
from ..models.email_ingest_log import EmailIngestLog
from ..models.email_attachment import EmailAttachment
from ..models.transaction import Transaction
from .excel_parser import excel_parser

logger = logging.getLogger(__name__)

class EmailIngestionService:
    """Main service for processing incoming emails with Excel attachments."""
    
    def __init__(self):
        self.temp_dir = tempfile.gettempdir()
        self.parser = excel_parser
    
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
            to_email: Recipient email (user@cfoseyfo.com)
            from_email: Sender email
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
            # Identify user and company from email alias
            user_info = self._get_user_from_alias(db, to_email)
            if not user_info:
                raise HTTPException(
                    status_code=400,
                    detail=f"No user found for email alias: {to_email}"
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
            file_hash = self.parser._calculate_file_hash(temp_file_path)
            
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
                storage_path=temp_file_path,
                file_size=len(await attachment.read()),
                status='UPLOADED'
            )
            db.add(attachment_record)
            db.commit()
            db.refresh(attachment_record)
            
            # Reset file position after read
            await attachment.seek(0)
            
            # Parse Excel file
            parse_result = self.parser.parse_file(temp_file_path, company_id)
            
            if not parse_result["success"]:
                attachment_record.status = 'FAILED'
                attachment_record.error_message = parse_result["error"]
                db.commit()
                return {
                    "success": False,
                    "filename": attachment.filename,
                    "error": parse_result["error"]
                }
            
            # Update attachment with parse results
            attachment_record.detected_bank = parse_result["bank_code"]
            attachment_record.status = 'PARSED'
            attachment_record.transactions_count = parse_result["transaction_count"]
            db.commit()
            
            # Create transactions
            created_transactions = 0
            for transaction_data in parse_result["transactions"]:
                transaction = Transaction(
                    **transaction_data,
                    source_id=attachment_record.id
                )
                db.add(transaction)
                created_transactions += 1
            
            # Final status update
            attachment_record.status = 'PROCESSED'
            attachment_record.processed_at = datetime.now()
            attachment_record.transactions_count = created_transactions
            db.commit()
            
            return {
                "success": True,
                "filename": attachment.filename,
                "attachment_id": str(attachment_record.id),
                "detected_bank": parse_result["bank_code"],
                "bank_name": parse_result["bank_name"],
                "transactions_count": created_transactions
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
    
    def _get_user_from_alias(self, db: Session, alias_email: str) -> Optional[Dict]:
        """Get user and company info from email alias."""
        alias_record = db.query(EmailAlias).filter(
            EmailAlias.alias_email == alias_email,
            EmailAlias.is_active == True
        ).first()
        
        if alias_record:
            return {
                "user_id": alias_record.user_id,
                "company_id": alias_record.company_id,
                "original_email": alias_record.original_email
            }
        return None
    
    def _is_excel_file(self, filename: Optional[str]) -> bool:
        """Check if file is an Excel file."""
        if not filename:
            return False
        
        excel_extensions = ['.xlsx', '.xls', '.xlsm', '.xltx', '.xltm']
        return any(filename.lower().endswith(ext) for ext in excel_extensions)
    
    def create_email_alias(
        self,
        db: Session,
        user_id: int,
        company_id: int,
        original_email: str
    ) -> EmailAlias:
        """Create email alias for user. Format: username@cfoseyfo.com"""
        # Extract username from original email
        username = original_email.split('@')[0]
        alias_email = f"{username}@cfoseyfo.com"
        
        # Check if alias already exists
        existing = db.query(EmailAlias).filter(
            EmailAlias.alias_email == alias_email
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Email alias {alias_email} already exists"
            )
        
        # Create new alias
        alias = EmailAlias(
            user_id=user_id,
            company_id=company_id,
            original_email=original_email,
            alias_email=alias_email
        )
        db.add(alias)
        db.commit()
        db.refresh(alias)
        
        return alias
    
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