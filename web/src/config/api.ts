// API configuration from environment variables
export const API_CONFIG = {
  host: import.meta.env.VITE_API_HOST || 'localhost',
  port: import.meta.env.VITE_API_PORT || '8888',
  get baseUrl() {
    return `http://${this.host}:${this.port}`
  }
}

// Helper to construct API URLs
export function apiUrl(path: string): string {
  return `${API_CONFIG.baseUrl}${path}`
}