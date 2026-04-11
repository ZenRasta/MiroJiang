const API_BASE = '/api';

export async function api(path, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    let message = `API Error: ${response.status}`;
    if (typeof errorData.detail === 'string') {
      message = errorData.detail;
    } else if (Array.isArray(errorData.detail)) {
      message = errorData.detail.map(e => `${e.loc?.slice(-1)?.[0] || 'field'}: ${e.msg}`).join('; ');
    } else if (errorData.error) {
      message = errorData.error;
    }
    const error = new Error(message);
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  if (response.status === 204) return null;
  const json = await response.json();
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    if (!json.success) {
      throw new Error(json.error || 'API request failed');
    }
    return json.data;
  }
  return json;
}

export function sseStream(path, onMessage, onError) {
  const url = `${API_BASE}${path}`;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {
      onMessage(event.data);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) onError(err);
    eventSource.close();
  };

  return () => eventSource.close();
}

export default api;
