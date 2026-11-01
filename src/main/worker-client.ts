import { utilityProcess, type UtilityProcess } from 'electron'
import type { WorkerRequest, WorkerResponse } from './protocol'

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  onProgress?: (p: { done: number; total: number }) => void
}

/** Starts the background worker and sends it requests. Restarts it if it crashes. */
export class WorkerClient {
  private proc: UtilityProcess | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1
  /** Called after the worker has crashed and been restarted. */
  onRestartHook: (() => void) | null = null

  constructor(
    private readonly script: string,
    private readonly args: string[],
    private readonly execArgv: string[],
    private readonly onEvent: (event: string, data: unknown) => void
  ) {
    this.start()
  }

  private start(): void {
    const proc = utilityProcess.fork(this.script, this.args, {
      serviceName: 'Outis worker',
      execArgv: this.execArgv,
      stdio: 'inherit'
    })
    proc.on('message', (msg: WorkerResponse) => this.handle(msg))
    proc.on('exit', (code) => {
      if (this.proc !== proc) return
      this.proc = null
      for (const p of this.pending.values()) p.reject(new Error(`Worker stopped (code ${code})`))
      this.pending.clear()
      // Restart after a crash, but give up if it keeps crashing.
      const now = Date.now()
      this.restarts = this.restarts.filter((t) => now - t < 60_000)
      if (!this.stopping && this.restarts.length < 3) {
        this.restarts.push(now)
        this.start()
        this.onRestartHook?.()
      }
    })
    this.proc = proc
  }

  private stopping = false
  private restarts: number[] = []

  stop(): void {
    this.stopping = true
    this.proc?.kill()
  }

  private handle(msg: WorkerResponse): void {
    if ('event' in msg) {
      this.onEvent(msg.event, msg.data)
      return
    }
    const p = this.pending.get(msg.id)
    if (!p) return
    if ('progress' in msg) {
      p.onProgress?.(msg.progress)
      return
    }
    this.pending.delete(msg.id)
    if ('error' in msg) p.reject(new Error(msg.error))
    else p.resolve(msg.result)
  }

  /** Send a request. Returns the job id (for cancelling) and a promise for the result. */
  startJob<T>(
    method: string,
    params?: unknown,
    onProgress?: Pending['onProgress']
  ): { jobId: number; promise: Promise<T> } {
    const id = this.nextId++
    const promise = new Promise<T>((resolve, reject) => {
      if (!this.proc) return reject(new Error('Worker not running'))
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress })
      const req: WorkerRequest = { id, method, params }
      this.proc.postMessage(req)
    })
    return { jobId: id, promise }
  }

  request<T>(method: string, params?: unknown): Promise<T> {
    return this.startJob<T>(method, params).promise
  }
}
