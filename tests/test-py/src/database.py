from typing import Optional

class Database:
    def __init__(self):
        self.connected = False
    
    def connect(self):
        self.connected = True
        print("Database connected")
    
    def query(self, sql: str) -> list:
        if not self.connected:
            raise RuntimeError("Not connected")
        return []
    
    def get_user(self, user_id: str) -> Optional[dict]:
        return self.query(f"SELECT * FROM users WHERE id = '{user_id}'")
