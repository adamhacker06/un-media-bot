export interface Article {
  title: string;
  url: string;
  date: string;
  excerpt: string;
  source: string;
  score: number;
}

export interface Asset {
  title: string;
  asset_url: string;
  asset_type: 'image' | 'video';
  thumbnail_url: string;
  date: string;
  description: string;
}

export interface ChatHistoryItem {
  id: number;
  query: string;
}

// A single turn in the visible conversation
export interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  articles: Article[];
  assets: Asset[];
  isStreaming: boolean;
}

// What we send to the backend for multi-turn context
export interface HistoryMessage {
  role: 'user' | 'model';
  content: string;
}

export type TabId = 'answer' | 'sources' | 'assets';

export type SseEvent =
  | { type: 'token'; content: string }
  | { type: 'sources'; articles: Article[]; assets: Asset[] }
  | { type: 'error'; message: string };
