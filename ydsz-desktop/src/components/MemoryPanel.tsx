/**
 * @file MemoryPanel - Project Memory management UI (P1-2)
 * @description Cross-session memory with context injection
 */

import { useState, useEffect, useCallback } from 'react';

interface MemoryEntry {
  id: string;
  project_path: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// Mock data for MVP
const MOCK_ENTRIES: MemoryEntry[] = [
  {
    id: '1',
    project_path: '/workspace/my-app',
    content: 'Uses React 19 with TanStack Router, Tauri 2 for desktop shell',
    tags: ['tech-stack', 'architecture'],
    created_at: '2026-10-08T10:00:00Z',
    updated_at: '2026-10-10T08:00:00Z',
  },
  {
    id: '2',
    project_path: '/workspace/my-app',
    content: 'Team prefers functional components with hooks, no class components',
    tags: ['convention', 'coding-style'],
    created_at: '2026-10-09T14:00:00Z',
    updated_at: '2026-10-09T14:00:00Z',
  },
];

export function MemoryPanel() {
  const [entries] = useState<MemoryEntry[]>(MOCK_ENTRIES);
  const [selectedProject] = useState<string>('/workspace/my-app');
  const [contextInjection, setContextInjection] = useState<string>('');

  const handleGetContextInjection = useCallback(() => {
    const ctx = entries
      .filter(e => e.project_path === selectedProject)
      .map(e => `- [${e.tags.join(', ')}] ${e.content}`)
      .join('\n');
    setContextInjection(`## Project Memory\n${ctx}`);
  }, [entries, selectedProject]);

  useEffect(() => {
    handleGetContextInjection();
  }, [handleGetContextInjection]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b">
        <h1 className="text-lg font-semibold">Project Memory</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cross-session memory that auto-injects into Agent context
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Context injection preview */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium">Context Injection Preview</h2>
            <button
              onClick={handleGetContextInjection}
              className="text-xs bg-secondary px-2 py-1 rounded hover:bg-secondary/80"
            >
              Refresh
            </button>
          </div>
          <pre className="text-xs bg-secondary/30 rounded p-3 whitespace-pre-wrap font-mono max-h-40 overflow-auto">
            {contextInjection || 'No memory entries for this project'}
          </pre>
        </div>

        {/* Memory entries list */}
        <div>
          <h2 className="text-sm font-medium mb-2">Memory Entries ({entries.length})</h2>
          <div className="space-y-2">
            {entries.map(entry => (
              <div key={entry.id} className="border rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <p className="text-sm flex-1">{entry.content}</p>
                  <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
                    {new Date(entry.updated_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {entry.tags.map(tag => (
                    <span key={tag} className="text-xs bg-purple-500/10 text-purple-500 px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
