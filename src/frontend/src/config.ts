import type { backendInterface } from "./backend";
import { HttpBackend } from "./httpBackend";

let backendCache: backendInterface | null = null;

export async function createActorWithConfig(): Promise<backendInterface> {
  if (backendCache) {
    return backendCache;
  }

  backendCache = new HttpBackend();
  return backendCache;
}

export async function loadConfig(): Promise<{ ii_derivation_origin?: string }> {
  return {};
}
