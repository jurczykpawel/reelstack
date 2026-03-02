import { staticFile } from 'remotion';

/**
 * Resolves a media URL for use in Remotion components.
 * - HTTP(S) URLs pass through unchanged
 * - Other strings are treated as filenames in public/ and resolved via staticFile()
 */
export function resolveMediaUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Extract just the filename if it's an absolute/relative path
  const filename = url.includes('/') ? url.split('/').pop()! : url;
  return staticFile(filename);
}
