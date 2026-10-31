// SPDX-License-Identifier: GPL-3.0-or-later

/** Repository-independent model metadata. Missing optional fields mean unknown. */
export interface ModelResult {
  title: string;
  /** Absolute HTTP(S) URL of the model's detail page. */
  url: string;
  providerId: string;
  /** Provider-local identifier, normalized to a string. */
  id?: string;
  /** Absolute HTTP(S) image URL. */
  thumbnail?: string;
  creator?: string;
  /** Amount in major currency units, with an ISO 4217 currency code. */
  price?: { amount: number; currency: string };
  /** Reliable API or bundled provider semantics; missing numeric price alone does not imply free. */
  isFree?: boolean;
  /** Known file extensions, lowercase without a leading dot, e.g. "stl". */
  formats?: string[];
  /** ISO 8601 creation date, retaining only the precision the provider knows. */
  createdAt?: string;
  /** ISO 8601 publication date when distinct from creation. */
  publishedAt?: string;
  /** Provider-specific numeric score; not comparable across repositories. */
  popularity?: number;
  downloads?: number;
  /** Rating normalized to a 0–5 scale when the source scale is known. */
  rating?: number;
  views?: number;
  comments?: number;
  isDownloadable?: boolean;
  /** Provider-supplied license label or identifier. */
  license?: string;
  /** Exact search term that found this result, including an expanded term. */
  query?: string;
}
