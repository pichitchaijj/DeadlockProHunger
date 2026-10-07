/** Error thrown by the Deadlock API client. Plain module (no server-only) so UI code and tests can classify it. */
export class DeadlockApiError extends Error {
  readonly status: number | null
  readonly path: string

  constructor(message: string, status: number | null, path: string) {
    super(message)
    this.name = 'DeadlockApiError'
    this.status = status
    this.path = path
  }
}
