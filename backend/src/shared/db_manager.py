import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session, declarative_base
from dotenv import load_dotenv

backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env_path = os.path.join(backend_dir, ".env")
load_dotenv(env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
_engine = None

SessionLocal = sessionmaker(autocommit=False, autoflush=False)
db_session = scoped_session(SessionLocal)

Base = declarative_base()
Base.query = db_session.query_property()


def get_engine():
    """Create and cache the SQLAlchemy engine on first use."""
    global _engine

    if _engine is not None:
        return _engine

    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL not found in backend/.env")

    engine_kwargs = {"pool_pre_ping": True}
    if not DATABASE_URL.startswith("sqlite"):
        engine_kwargs.update(
            pool_recycle=3600,
            pool_size=20,
            max_overflow=20,
        )

    _engine = create_engine(DATABASE_URL, **engine_kwargs)
    SessionLocal.configure(bind=_engine)
    db_session.configure(bind=_engine)
    return _engine


def init_db():
    """Initialize database tables."""
    import src.crawl.infrastructure.database.models

    Base.metadata.create_all(bind=get_engine())


def get_db():
    """Dependency for getting DB session."""
    get_engine()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
