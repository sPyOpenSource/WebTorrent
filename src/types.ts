export interface Comment {
  id: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: string;
  likes: number;
}

export interface VideoTorrent {
  id: string;
  title: string;
  description: string;
  magnetUrl: string;
  category: string;
  uploader: string;
  uploaderAvatar?: string;
  views: number;
  duration: string;
  uploadedAt: string;
  thumbnailUrl: string;
  comments: Comment[];
  isCustom?: boolean; // If seeded locally in this session
  localFile?: File;    // The actual local file being seeded
}

export interface TorrentStats {
  infoHash: string;
  magnetUrl: string;
  downloadSpeed: number; // in bytes/sec
  uploadSpeed: number;   // in bytes/sec
  downloaded: number;    // in bytes
  uploaded: number;      // in bytes
  progress: number;      // 0 to 1
  peersCount: number;
  timeRemaining: number; // in ms
  ratio: number;
  numPeers: number;
}
