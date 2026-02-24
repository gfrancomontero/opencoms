const BASE = '';

export async function fetchStatus() {
  const resp = await fetch(`${BASE}/api/status`);
  return resp.json();
}

export async function acknowledgeSecurityScreen() {
  const resp = await fetch(`${BASE}/api/acknowledge-security`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return resp.json();
}

export async function selectFolder(usePicker: boolean, manualPath?: string) {
  const resp = await fetch(`${BASE}/api/folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(usePicker ? { usePicker: true } : { path: manualPath }),
  });
  return resp.json();
}

export async function fetchFiles() {
  const resp = await fetch(`${BASE}/api/files`);
  return resp.json();
}

export async function reindex() {
  const resp = await fetch(`${BASE}/api/reindex`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return resp.json();
}

export async function togglePrivacyMode(enabled: boolean) {
  const resp = await fetch(`${BASE}/api/privacy-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return resp.json();
}

export async function openFile(filePath: string) {
  const resp = await fetch(`${BASE}/api/open-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  });
  return resp.json();
}

export function createEventSource(): EventSource {
  return new EventSource(`${BASE}/api/events`);
}

export async function* streamChat(
  message: string,
  history: Array<{ role: string; content: string }>,
): AsyncGenerator<{ type: string; data: any }> {
  const resp = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });

  if (!resp.ok || !resp.body) {
    throw new Error('Chat request failed');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(line.slice(6));
          yield parsed;
        } catch {
          // skip
        }
      }
    }
  }
}
