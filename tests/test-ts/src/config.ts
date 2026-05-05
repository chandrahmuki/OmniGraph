export class Config {
  private values: Record<string, string> = {
    authSecret: "test-secret",
    port: "3000",
  };

  get(key?: string): any {
    if (key) return this.values[key];
    return this.values;
  }

  set(key: string, value: string) {
    this.values[key] = value;
  }
}
