import { Config } from "./config";

export class AuthService {
  private config: Config;
  private initialized: boolean = false;

  constructor(config: Config) {
    this.config = config;
  }

  async initialize() {
    console.log("Initializing auth with secret:", this.config.get("authSecret"));
    this.initialized = true;
  }

  isAuthenticated(): boolean {
    return this.initialized;
  }

  validateToken(token: string): boolean {
    return token.length > 10;
  }
}
