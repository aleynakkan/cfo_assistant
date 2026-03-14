# app/routes/notifications.py

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.deps import get_db, get_current_user, get_current_company
from app.models.user import User
from app.models.company import Company
from app.models.notification import Notification
from app.schemas.tax import NotificationResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/", response_model=List[NotificationResponse])
def get_notifications(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Kullanıcının bildirimlerini döndürür (en yeniden eskiye)."""
    notifications = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.company_id == company.id,
        )
        .order_by(desc(Notification.created_at))
        .limit(limit)
        .all()
    )
    return notifications


@router.get("/unread-count", response_model=dict)
def get_unread_count(
    current_user: User = Depends(get_current_user),
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Okunmamış bildirim sayısını döndürür."""
    count = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.company_id == company.id,
            Notification.is_read == False,
        )
        .count()
    )
    return {"count": count}


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bildirimi okundu olarak işaretle."""
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bildirim bulunamadı.",
        )
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification


@router.patch("/read-all", response_model=dict)
def mark_all_as_read(
    current_user: User = Depends(get_current_user),
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Tüm bildirimleri okundu olarak işaretle."""
    updated = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.company_id == company.id,
            Notification.is_read == False,
        )
        .update({"is_read": True})
    )
    db.commit()
    return {"updated": updated}
