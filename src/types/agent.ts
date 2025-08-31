// Agent interface types based on technical spec

export type AgentEvents = {
  audio: (evt: { stream: MediaStream }) => void;
  text: (evt: { delta: string }) => void;
  ready: () => void;
  error: (e: Error) => void;
  state: (evt: { state: AgentState }) => void;
};

export type AgentState = 
  | 'disconnected'
  | 'connecting' 
  | 'connected'
  | 'speaking'
  | 'listening'
  | 'processing';

export interface AgentOptions {
  instructions: string;
  voice?: string;
  model?: string;
}

export interface Agent {
  connect(opts: AgentOptions): Promise<void>;
  sendAudio(chunk: Float32Array): void;
  updateInstructions(delta: string): void;
  endTurn(): void;
  on<K extends keyof AgentEvents>(event: K, cb: AgentEvents[K]): void;
  off<K extends keyof AgentEvents>(event: K, cb: AgentEvents[K]): void;
  disconnect(): Promise<void>;
  getState(): AgentState;
}

// Learning loop states
export type LearningState = 
  | 'intro'      // Introducing the sentence
  | 'blocks'     // Breaking into chunks
  | 'repeat'     // User repeating blocks
  | 'full'       // Full sentence practice
  | 'mastered'   // Sentence mastered
  | 'next';      // Moving to next sentence

export interface LearningSession {
  state: LearningState;
  current_sentence?: string;
  current_block?: string;
  block_index?: number;
  total_blocks?: number;
  attempts: number;
  corrections: number;
}
