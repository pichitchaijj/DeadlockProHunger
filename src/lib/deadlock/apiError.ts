/** Error thrown by the Deadlock API client. Plain module (no server-only) so UI code and tests can classify it. */
export class DeadlockApiError extends Error {
  readonly status: number | null
  readonly path: string
  /** True when the client refused the call itself (access circuit open) and nothing was sent upstream. */
  readonly circuitOpen: boolean

  constructor(message: string, status: number | null, path: string, options: { circuitOpen?: boolean } = {}) {
    super(message)
    this.name = 'DeadlockApiError'
    this.status = status
    this.path = path
    this.circuitOpen = options.circuitOpen ?? false
  }
}
