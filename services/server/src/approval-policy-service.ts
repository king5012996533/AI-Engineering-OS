import type { ApprovalPolicy, RuntimeDiffArtifact } from "@aieos/protocol";

export type EvaluatedArtifactPolicy = ApprovalPolicy & {
  changedFiles: string[];
};

const highRiskPatterns = [
  /^\.github\//,
  /^\.env/,
  /(^|\/)package\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)schema\.prisma$/,
  /(^|\/)migrations\//,
  /(^|\/)middleware\./,
  /(^|\/)auth\./,
  /(^|\/)permission/i,
  /(^|\/)security/i,
];

const lowRiskPatterns = [/README\.md$/, /\.md$/, /\.test\./, /\.spec\./, /AI_ENGINEERING_OS_TASKS\.md$/];

export function evaluateApprovalPolicy(artifact: RuntimeDiffArtifact): EvaluatedArtifactPolicy {
  const changedFiles = extractChangedFiles(artifact.data.patch);
  const hasDeletion = /deleted file mode|^--- a\//m.test(artifact.data.patch) && /^\+\+\+ \/dev\/null/m.test(artifact.data.patch);
  const touchesHighRisk = changedFiles.some((file) => highRiskPatterns.some((pattern) => pattern.test(file)));
  const onlyLowRisk = changedFiles.length > 0 && changedFiles.every((file) => lowRiskPatterns.some((pattern) => pattern.test(file)));

  if (hasDeletion || touchesHighRisk) {
    return {
      id: "policy_high_risk_human_required",
      artifactType: artifact.type,
      riskLevel: "high",
      requiresHuman: true,
      reason: hasDeletion
        ? "The artifact deletes files, so human approval is mandatory."
        : "The artifact touches sensitive engineering surfaces.",
      changedFiles,
    };
  }

  if (onlyLowRisk) {
    return {
      id: "policy_low_risk_auto_approved",
      artifactType: artifact.type,
      riskLevel: "low",
      requiresHuman: false,
      reason: "The artifact only changes documentation or test/proposal files.",
      changedFiles,
    };
  }

  return {
    id: "policy_medium_risk_human_required",
    artifactType: artifact.type,
    riskLevel: "medium",
    requiresHuman: true,
    reason: "The artifact changes source or product files and requires human review.",
    changedFiles,
  };
}

function extractChangedFiles(patch: string): string[] {
  const files = new Set<string>();
  for (const match of patch.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)) {
    files.add(match[2]);
  }
  return [...files];
}

