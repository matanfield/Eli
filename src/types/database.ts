// Database types based on Supabase schema v2

export type LearnedStatus = 'new' | 'attempted' | 'mastered' | 'easy';

export type Gender = 'male' | 'female' | 'neutral';

export type LanguageLevel = 'native' | 'fluent' | 'conversational' | 'basic' | 'words';

export interface BaseLanguage {
  code: string;
  level: LanguageLevel;
}

export interface Profile {
  user_id: string;
  name: string;
  gender?: Gender;
  base_languages: BaseLanguage[];
  target_languages: string[];
  created_at: string;
  updated_at: string;
}

export interface LearnedSentence {
  id: number;
  user_id: string;
  language_code: string;
  sentence_text: string;
  status: LearnedStatus;
  attempt_count: number;
  last_score?: number;
  first_seen_at: string;
  last_attempted_at?: string;
  updated_at: string;
}

export interface Memory {
  id: number;
  user_id: string;
  content: string;
  topic?: string;
  updated_at: string;
}

// API Response types
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  success: boolean;
}

// Session state
export interface SessionState {
  user_id: string;
  current_sentence_id?: number;
  next_candidate_id?: number;
  last_action_at: string;
}
