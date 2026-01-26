"""
Email ingestion endpoints for webhook processing and management.
Handles incoming emails, alias management, and rollback operations.
"""

from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from sqlalchemy.orm import Session
from typing import Optional, List
import logging

from ..core.database import get_db
from ..core.deps import get_current_user, get_current_company
from ..models.user import User
from ..models.company import Company
from ..models.email_ingest_log import EmailIngestLog
from ..models.email_attachment import EmailAttachment
from ..services.email_ingestion import email_ingestion_service

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/webhook/email")
async def process_email_webhook(
    to_email: str = Form(..., description="Recipient email address (user@cfoseyfo.com)"),
    from_email: Optional[str] = Form(None, description="Sender email address"),
    subject: Optional[str] = Form(None, description="Email subject"),
    body_plain: Optional[str] = Form(None, description="Email body"),
    attachments: List[UploadFile] = File(default=[], description="Email attachments"),
    db: Session = Depends(get_db)
):
    """
    Webhook endpoint for processing incoming emails.
    
    This endpoint receives emails from external services (Mailgun, AWS SES, etc.)
    and processes Excel attachments to create transactions.
    """
    try:
        logger.info(f"Processing email webhook: to={to_email}, from={from_email}")
        
        result = await email_ingestion_service.process_incoming_email(
            db=db,
            to_email=to_email,
            from_email=from_email,
            subject=subject,
            attachments=attachments
        )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in email webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error processing email")



@router.get("/logs")
async def get_email_logs(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    current_company: Company = Depends(get_current_company),
    db: Session = Depends(get_db)
):
    """Get email processing logs for the current user."""
    logs = db.query(EmailIngestLog).filter(
        EmailIngestLog.user_id == current_user.id,
        EmailIngestLog.company_id == current_company.id
    ).order_by(EmailIngestLog.received_at.desc()).limit(limit).all()
    
    return {
        "logs": [
            {
                "id": str(log.id),
                "to_email": log.to_email,
                "from_email": log.from_email,
                "subject": log.subject,
                "status": log.status,
                "received_at": log.received_at,
                "processed_at": log.processed_at,
                "error_message": log.error_message
            }
            for log in logs
        ]
    }

@router.get("/attachments/{email_log_id}")
async def get_email_attachments(
    email_log_id: str,
    current_user: User = Depends(get_current_user),
    current_company: Company = Depends(get_current_company),
    db: Session = Depends(get_db)
):
    """Get attachments for a specific email log."""
    # Verify user owns this email log
    email_log = db.query(EmailIngestLog).filter(
        EmailIngestLog.id == email_log_id,
        EmailIngestLog.user_id == current_user.id,
        EmailIngestLog.company_id == current_company.id
    ).first()
    
    if not email_log:
        raise HTTPException(status_code=404, detail="Email log not found")
    
    attachments = db.query(EmailAttachment).filter(
        EmailAttachment.email_log_id == email_log_id
    ).all()
    
    return {
        "attachments": [
            {
                "id": str(att.id),
                "filename": att.filename,
                "file_size": att.file_size,
                "detected_bank": att.detected_bank,
                "status": att.status,
                "transactions_count": att.transactions_count,
                "created_at": att.created_at,
                "processed_at": att.processed_at,
                "error_message": att.error_message
            }
            for att in attachments
        ]
    }

@router.post("/attachments/{attachment_id}/rollback")
async def rollback_attachment_transactions(
    attachment_id: str,
    current_user: User = Depends(get_current_user),
    current_company: Company = Depends(get_current_company),
    db: Session = Depends(get_db)
):
    """Rollback all transactions created from a specific attachment."""
    # Verify user owns this attachment
    attachment = db.query(EmailAttachment).join(EmailIngestLog).filter(
        EmailAttachment.id == attachment_id,
        EmailIngestLog.user_id == current_user.id,
        EmailIngestLog.company_id == current_company.id
    ).first()
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    result = email_ingestion_service.rollback_email_transactions(
        db=db,
        attachment_id=attachment_id
    )
    
    return result


@router.get("/status")
async def get_ingestion_status():
    """Get email ingestion service status."""
    return {
        "service": "Email Ingestion Service",
        "status": "active",
        "supported_file_types": [".xlsx", ".xls", ".xlsm", ".xltx", ".xltm"],
        "supported_banks": ["akbank", "enpara", "yapikredi"]
    }