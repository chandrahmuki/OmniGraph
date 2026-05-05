import { AuthService } from "./auth";
import { Config } from "./config";

export class App {
  private auth: AuthService;
  private config: Config;

  constructor() {
    this.config = new Config();
    this.auth = new AuthService(this.config);
  }

  async start() {
    console.log("Starting app with config:", this.config.get());
    await this.auth.initialize();
  }

  async handleRequest(route: string) {
    if (!this.auth.isAuthenticated()) {
      throw new Error("Unauthorized");
    }
    return this.routeHandler(route);
  }

  private routeHandler(route: string): string {
    return `Handling route: ${route}`;
  }
}
