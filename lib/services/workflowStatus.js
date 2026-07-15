// Pure staleness rule, shared by the API and tests. A generated workflow is
// stale once the Blueprint has advanced past the version it was generated from.
export function isWorkflowStale(generatedFromVersion, currentBlueprintVersion) {
  if (generatedFromVersion == null || currentBlueprintVersion == null) return false;
  return generatedFromVersion !== currentBlueprintVersion;
}
