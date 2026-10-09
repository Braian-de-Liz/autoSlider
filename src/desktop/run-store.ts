export const RUN_STATES = ['RECEBIDO', 'ROTEADO', 'SPEC_GERADA', 'VALIDADA', 'RENDERIZADA', 'ENTREGUE'] as const
export const TERMINAL_STATES = ['ENTREGUE', 'FALHOU'] as const
/** Desvio da seção 5: SPEC_GERADA → SPEC_INVALIDA → (retry) → SPEC_GERADA. */
export const DEVIATION_STATES = ['SPEC_INVALIDA'] as const

export type TimelineStage = typeof RUN_STATES[number]
export type RunState = TimelineStage | typeof TERMINAL_STATES[number] | typeof DEVIATION_STATES[number]

export interface RunEvent {
  runId: string
  /** Monotônico por store: o cliente descarta eventos mais antigos que o último aplicado. */
  seq: number
  state: RunState
  /** Etapa da timeline em que o run está; em SPEC_INVALIDA e FALHOU, a última etapa alcançada. */
  stage: TimelineStage
  message: string
  at: string
  errorCode?: string
  artifactPath?: string
}

export interface StoredArtifact {
  runId: string
  hash: string
  rendererVersion: string
  png: Uint8Array
  svg: Uint8Array
}

type Listener = (event: RunEvent) => void
type Work = (context: { runId: string; transition: (state: Exclude<RunState, 'RECEBIDO' | 'FALHOU'>, message?: string, artifactPath?: string) => void; fail: (code: string, message: string) => void }) => Promise<void>

const messages: Record<RunState, string> = {
  RECEBIDO: 'Pedido recebido.',
  ROTEADO: 'Pedido roteado para o tipo de saída.',
  SPEC_GERADA: 'Spec gerada.',
  SPEC_INVALIDA: 'Spec inválida; gerando de novo.',
  VALIDADA: 'Spec validada.',
  RENDERIZADA: 'Arquivo renderizado.',
  ENTREGUE: 'Artefato pronto.',
  FALHOU: 'Execução falhou.'
}

const isStage = (state: RunState): state is TimelineStage => (RUN_STATES as readonly string[]).includes(state)

export class RunStore {
  private readonly runs = new Map<string, RunEvent>()
  private readonly artifacts = new Map<string, StoredArtifact>()
  private readonly candidates = new Map<string, unknown>()
  private readonly listeners = new Set<Listener>()
  private seq = 0

  start(work?: Work): RunEvent {
    const runId = crypto.randomUUID()
    const first = this.publish(runId, 'RECEBIDO')
    if (work) {
      void work({
        runId,
        transition: (state, message, artifactPath) => this.publish(runId, state, message, undefined, artifactPath),
        fail: (code, message) => this.publish(runId, 'FALHOU', message, code)
      }).catch((error: unknown) => this.publish(runId, 'FALHOU', error instanceof Error ? error.message : String(error), 'E_PROVIDER'))
    } else {
      void this.advanceDemo(runId)
    }
    return first
  }

  latest(): RunEvent | undefined { return [...this.runs.values()].at(-1) }
  get(runId: string): RunEvent | undefined { return this.runs.get(runId) }
  all(): RunEvent[] { return [...this.runs.values()] }
  registerArtifact(artifact: StoredArtifact): void { this.artifacts.set(artifact.runId, artifact) }
  getArtifact(runId: string): StoredArtifact | undefined { return this.artifacts.get(runId) }
  /** Seção 8: a última spec candidata é preservada para depuração, inclusive em FALHOU. */
  recordCandidate(runId: string, candidate: unknown): void { this.candidates.set(runId, candidate) }
  getCandidate(runId: string): unknown { return this.candidates.get(runId) }
  subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  private async advanceDemo(runId: string): Promise<void> {
    for (const state of RUN_STATES.slice(1)) {
      await new Promise<void>((resolve) => setTimeout(resolve, 120))
      this.publish(runId, state)
    }
  }

  private publish(runId: string, state: RunState, message = messages[state], errorCode?: string, artifactPath?: string): RunEvent {
    const stage: TimelineStage = isStage(state) ? state : this.runs.get(runId)?.stage ?? 'RECEBIDO'
    const event: RunEvent = { runId, seq: ++this.seq, state, stage, message, at: new Date().toISOString(), ...(errorCode ? { errorCode } : {}), ...(artifactPath ? { artifactPath } : {}) }
    this.runs.set(runId, event)
    for (const listener of this.listeners) listener(event)
    return event
  }
}
