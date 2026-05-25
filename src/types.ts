/**
 * Strict TypeScript type declarations for Google Play Books API payloads.
 */

export interface GoogleBookMetadata {
  title?: string;
  volume_title?: string;
  authors?: string | string[];
  author?: string;
  creator?: string;
  pub_date?: string;
  pubDate?: string;
  date?: string;
  publication_date?: string;
  publisher?: string;
  language?: string;
  num_pages?: number;
  preview?: string;
}

export interface GoogleBookSegmentManifest {
  label: string;
  title?: string;
  order: number;
  link?: string;
}

export interface GoogleBookPageManifest {
  pid: string;
  src?: string;
  order: number;
}

export interface GoogleBookManifest {
  volume_id?: string;
  title?: string;
  author?: string;
  language?: string;
  is_right_to_left?: boolean;
  metadata: GoogleBookMetadata;
  segment?: GoogleBookSegmentManifest[];
  page?: GoogleBookPageManifest[];
}

export interface GoogleBookSegment {
  content?: string;
  style?: string;
  page?: GoogleBookPageManifest[];
}

export interface GoogleBookTocEntry {
  label: string;
  depth?: number;
  page_index?: number;
}
