from typing import Optional
from .database import Database

def authenticate_user(token: str, db: Database) -> Optional[dict]:
    if not token or len(token) < 10:
        return None
    return db.get_user(token[:10])

def validate_token(token: str) -> bool:
    return len(token) > 10 and token.isalnum()
