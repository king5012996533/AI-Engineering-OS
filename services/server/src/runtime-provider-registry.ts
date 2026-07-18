import type { RuntimeCapabilities } from "@aieos/protocol";
import { RuntimeManager } from "./runtime-manager.js";
import { MockRuntime } from "./runtimes/mock-runtime.js";

const manager = new RuntimeManager();
manager.register(new MockRuntime());

export function getRuntimeManager(): RuntimeManager {
  return manager;
}

export function listRuntimeProviders(): RuntimeCapabilities[] {
  return manager.listCapabilities();
}
