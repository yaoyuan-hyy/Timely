export function resolveApiUrl(path: string, base = ''): string {
  if (!path.startsWith('/api/')) throw Error('invalid_api_path');
  if (!base) return path;
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('API 地址必须是 HTTPS 来源地址');
  return `${url.origin}${path}`;
}
export function apiUrl(path: string) {
  return resolveApiUrl(path, process.env.NEXT_PUBLIC_API_BASE_URL || '');
}
