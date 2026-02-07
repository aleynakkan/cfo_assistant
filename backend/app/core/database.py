from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Check environment
ENV = os.getenv("ENV", "local")

# Use PostgreSQL only in production environment
if ENV == "production":
    SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
    if not SQLALCHEMY_DATABASE_URL:
        raise ValueError("DATABASE_URL must be set in production environment")
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
else:
    # Local development - use SQLite
    db_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    db_path = os.path.join(db_dir, "cfo_assistant.db")
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{db_path}"
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to get database session
def get_db():
    """Get database session for dependency injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()