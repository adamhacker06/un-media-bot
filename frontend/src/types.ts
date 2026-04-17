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

export type TabId = 'answer' | 'sources' | 'assets';

// SSE event shapes from the backend
export type SseEvent =
  | { type: 'token'; content: string }
  | { type: 'sources'; articles: Article[]; assets: Asset[] }
  | { type: 'error'; message: string };
