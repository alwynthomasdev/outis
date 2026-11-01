// Messages between the main process and the background worker.

export const MODEL_ID = 'Xenova/bert-base-NER'
export const MODEL_FILE = 'onnx/model_quantized.onnx'

export interface WorkerRequest {
  id: number
  method: string
  params?: unknown
}

export type WorkerResponse =
  | { id: number; result: unknown }
  | { id: number; error: string; cancelled?: boolean }
  | { id: number; progress: { done: number; total: number } }
  | { event: 'ready' | 'network-blocked'; data: unknown }

export interface NerStatus {
  modelId: string
  installed: boolean
  loaded: boolean
  error: string | null
}
