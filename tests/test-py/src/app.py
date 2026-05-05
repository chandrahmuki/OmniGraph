from .database import Database
from .auth import authenticate_user

class App:
    def __init__(self):
        self.db = Database()
    
    def handle_request(self, token: str, route: str):
        user = authenticate_user(token, self.db)
        if not user:
            raise PermissionError("Unauthorized")
        return self.route_handler(route)
    
    def route_handler(self, route: str) -> str:
        return f"Handling route: {route}"
