// Domain errors for the Blueprint engine. Each carries an HTTP statusCode so
// the API layer (withAuth / route handlers) can translate them uniformly.

export class BlueprintNotReadyError extends Error {
  constructor(status, blocking = []) {
    super(
      `Blueprint is not ready to generate a workflow (status: ${status}).` +
      (blocking.length ? ` Still required: ${blocking.join(', ')}.` : '')
    );
    this.name = 'BlueprintNotReadyError';
    this.statusCode = 409;
    this.blueprintStatus = status;
    this.blocking = blocking;
  }
}

export class StaleVersionError extends Error {
  constructor(requested, current) {
    super(
      `Workflow can only be generated from the current Blueprint version ` +
      `(v${current}); v${requested} is outdated. Refresh and try again.`
    );
    this.name = 'StaleVersionError';
    this.statusCode = 409;
    this.requestedVersion = requested;
    this.currentVersion = current;
  }
}
