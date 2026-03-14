# app/models/notification.py

from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base


class Notification(Base):
    """Kullanıcı bildirimleri tablosu."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    type = Column(String, nullable=False, default="tax_reminder")  # tax_reminder, system, etc.
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    related_entity_type = Column(String, nullable=True)   # "tax", "transaction", etc.
    related_entity_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
