"""
Email Attachments model for tracking processed files.
Includes duplicate protection via file_hash and full traceability.
"""

import uuid
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class EmailAttachment(Base):
    """
    Tracks processed email attachments with duplicate protection.
    """
    __tablename__ = "email_attachments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email_log_id = Column(UUID(as_uuid=True), ForeignKey("email_ingest_logs.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_hash = Column(String(64), unique=True, nullable=False, index=True)  # SHA-256 for duplicates
    storage_path = Column(Text, nullable=True)  # Where file is stored
    file_size = Column(Integer, nullable=True)
    detected_bank = Column(String(50), nullable=True)  # akbank, enpara, yapikredi
    status = Column(String(20), nullable=False, default='UPLOADED')  # UPLOADED, PARSED, PROCESSED, FAILED
    transactions_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    processed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    email_log = relationship("EmailIngestLog", back_populates="attachments")
    
    def __repr__(self):
        return f"<EmailAttachment(filename='{self.filename}', bank='{self.detected_bank}', status='{self.status}')>"