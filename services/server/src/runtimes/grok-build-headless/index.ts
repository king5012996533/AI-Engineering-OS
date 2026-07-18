// Grok Build Headless Bridge — Public exports

export { GrokBuildHeadlessRuntime } from "./adapter.js";
export type { GrokBuildHeadlessOptions } from "./adapter.js";
export { buildGrokCommand, resolveWorktreeCwd } from "./command.js";
export type { GrokCommandOptions, BuiltCommand, GrokStreamingEvent } from "./command.js";
export { parseStreamingLine, mapGrokEvent } from "./event-mapper.js";
export type { MapperDeps, MappedEvent } from "./event-mapper.js";
export { extractWorktreeDiff, buildDiffArtifact, extractDiffArtifact } from "./diff.js";
export type { DiffExtractionInput, DiffExtractionResult } from "./diff.js";
