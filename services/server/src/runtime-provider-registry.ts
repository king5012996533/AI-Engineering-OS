import type { RuntimeCapabilities } from "@aieos/protocol";
import { RuntimeManager } from "./runtime-manager.js";
import { MockRuntime } from "./runtimes/mock-runtime.js";
import { GrokBuildHeadlessRuntime } from "./runtimes/grok-build-headless/index.js";

const manager = new RuntimeManager();
manager.register(new MockRuntime());
manager.register(new GrokBuildHeadlessRuntime());

export function getRuntimeManager(): RuntimeManager {
  return manager;
}

export function listRuntimeProviders(): RuntimeCapabilities[] {
  return manager.listCapabilities();
}
