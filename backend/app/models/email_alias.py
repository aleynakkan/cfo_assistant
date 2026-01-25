"""
Email Aliases model for mapping user emails to CFO system aliases.
Maps user@gmail.com to user@cfoseyfo.com format.
"""

from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class EmailAlias(Base):
    """
    Maps user email addresses to CFO system aliases.
    Example: kerem@gmail.com -> kerem@cfoseyfo.com
    """
    __tablename__ = "email_aliases"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    original_email = Column(String(255), nullable=False, index=True)  # kerem@gmail.com
    alias_email = Column(String(255), unique=True, nullable=False, index=True)  # kerem@cfoseyfo.com
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User")
    company = relationship("Company")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('user_id', 'company_id', name='uq_user_company_alias'),
    )
    
    def __repr__(self):
        return f"<EmailAlias(original='{self.original_email}', alias='{self.alias_email}', company_id={self.company_id})>"