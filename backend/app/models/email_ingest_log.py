"""
Email Ingest Logs model for tracking email processing.
Maintains full audit trail of all incoming emails.
"""

import uuid
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class EmailIngestLog(Base):
    """
    Tracks all incoming emails for processing and audit purposes.
    """
    __tablename__ = "email_ingest_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    to_email = Column(String(255), nullable=False, index=True)  # user@cfoseyfo.com
    from_email = Column(String(255), nullable=True)
    subject = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default='PENDING')  # PENDING, PROCESSING, SUCCESS, FAILED
    error_message = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    received_at = Column(DateTime(timezone=True), server_default=func.now())
    processed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    user = relationship("User")
    company = relationship("Company")
    attachments = relationship("EmailAttachment", back_populates="email_log")
    
    def __repr__(self):
        return f"<EmailIngestLog(to='{self.to_email}', status='{self.status}', received_at='{self.received_at}')>"