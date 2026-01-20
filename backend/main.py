from dotenv import load_dotenv
import os

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import Base, engine
from app.models import transaction  # noqa
from app.models import user  # noqa
from app.models import company  # noqa
from app.models import planned_item  # noqa
from app.models import planned_match  # noqa
from app.models import company_settings  # noqa
from app.routes.transactions import router as transactions_router
from app.routes.dashboard import router as dashboard_router
from app.routes import planned as planned_routes
from app.routes.auth import router as auth_router
from app.routes.ai_chat import router as ai_chat_router
from app.routes.company_settings import router as company_settings_router
from app.routes.matches import router as matches_router

app = FastAPI(title="CFO Assistant API", redirect_slashes=False)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "https://cfo-frontend-332747511395.us-central1.run.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/")
def read_root():
    return {"message": "CFO Assistant API çalışıyor"}


app.include_router(
    auth_router,
    tags=["auth"],
)

app.include_router(
    transactions_router,
    prefix="/transactions",
    tags=["transactions"],
)

app.include_router(
    dashboard_router,
    prefix="/dashboard",
    tags=["dashboard"],
)

app.include_router(
    ai_chat_router,
    prefix="/ai",
    tags=["ai"],
)

app.include_router(
    company_settings_router,
    prefix="/company",
    tags=["company"],
)

app.include_router(
    planned_routes.router,
    prefix="/planned",
    tags=["planned_cashflow"]
)

app.include_router(
    matches_router,
)