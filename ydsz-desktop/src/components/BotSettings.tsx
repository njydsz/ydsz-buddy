/**
 * @file BotSettings - Multi-channel Bot Integration UI (P0-4)
 * @description Configure and manage bot channels (Feishu/Telegram/WeChat/Webhook)
 */

import { useState, useCallback } from 'react';

interface BotChannel {
  id: string;
  name: string;
  channel_type: string;
  enabled: boolean;
  webhook_token?: string;
  created_at: string;
}

const CHANNEL_TYPES = [
  { id: 'feishu', label: '飞书 (Feishu)', icon: '📩' },
  { id: 'telegram', label: 'Telegram', icon: '✈️' },
  { id: 'wechat', label: '企业微信 (WeCom)', icon: '💬' },
  { id: 'webhook', label: 'Generic Webhook', icon: '🔗' },
];

const MOCK_CHANNELS: BotChannel[] = [
  {
    id: '1',
    name: 'Code Review Bot',
    channel_type: 'feishu',
    enabled: true,
    webhook_token: 'sk-****-1234',
    created_at: '2026-10-10T08:00:00Z',
  },
];

export function BotSettings() {
  const [channels, setChannels] = useState<BotChannel[]>(MOCK_CHANNELS);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', channel_type: 'webhook', webhook_token: '' });

  const handleCreateChannel = useCallback(() => {
    if (!newChannel.name) return;
    const channel: BotChannel = {
      id: `ch-${Date.now()}`,
      name: newChannel.name,
      channel_type: newChannel.channel_type,
      enabled: true,
      webhook_token: newChannel.webhook_token || undefined,
      created_at: new Date().toISOString(),
    };
    setChannels(prev => [...prev, channel]);
    setShowCreateForm(false);
    setNewChannel({ name: '', channel_type: 'webhook', webhook_token: '' });
  }, [newChannel]);

  const handleToggle = useCallback((id: string) => {
    setChannels(prev => prev.map(ch =>
      ch.id === id ? { ...ch, enabled: !ch.enabled } : ch
    ));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setChannels(prev => prev.filter(ch => ch.id !== id));
  }, []);

  const getTypeLabel = (typeId: string) => {
    return CHANNEL_TYPES.find(t => t.id === typeId)?.label ?? typeId;
  };

  const getTypeIcon = (typeId: string) => {
    return CHANNEL_TYPES.find(t => t.id === typeId)?.icon ?? '🔧';
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Bot Channels</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Receive messages from IM channels and trigger local Agent tasks
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
        >
          + Add Channel
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Create form */}
        {showCreateForm && (
          <div className="border rounded-lg p-4 bg-secondary/20">
            <h3 className="text-sm font-medium mb-3">New Channel</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Channel name"
                value={newChannel.name}
                onChange={e => setNewChannel(prev => ({ ...prev, name: e.target.value }))}
                className="border rounded px-3 py-1.5 text-sm"
              />
              <select
                value={newChannel.channel_type}
                onChange={e => setNewChannel(prev => ({ ...prev, channel_type: e.target.value }))}
                className="border rounded px-3 py-1.5 text-sm"
              >
                {CHANNEL_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Webhook token (optional)"
                value={newChannel.webhook_token}
                onChange={e => setNewChannel(prev => ({ ...prev, webhook_token: e.target.value }))}
                className="border rounded px-3 py-1.5 text-sm md:col-span-2"
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleCreateChannel} className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded">
                Create
              </button>
              <button onClick={() => setShowCreateForm(false)} className="px-3 py-1.5 text-sm border rounded">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Channel list */}
        {channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <p className="text-2xl mb-2">🤖</p>
            <p>No channels configured</p>
            <p className="text-sm mt-1">Add a channel to receive messages from external bots</p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map(channel => (
              <div key={channel.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{getTypeIcon(channel.channel_type)}</span>
                    <div>
                      <h3 className="text-sm font-medium">{channel.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {getTypeLabel(channel.channel_type)} &middot; Created {new Date(channel.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-muted-foreground">{channel.enabled ? 'Enabled' : 'Disabled'}</span>
                      <input
                        type="checkbox"
                        checked={channel.enabled}
                        onChange={() => handleToggle(channel.id)}
                        className="rounded"
                      />
                    </label>
                    <button
                      onClick={() => handleDelete(channel.id)}
                      className="text-xs text-red-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {channel.webhook_token && (
                  <div className="mt-2 text-xs text-muted-foreground font-mono bg-secondary/30 rounded px-2 py-1">
                    Token: {channel.webhook_token}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Webhook usage info */}
        <div className="border rounded-lg p-4 mt-6">
          <h3 className="text-sm font-medium mb-2">Webhook Usage</h3>
          <p className="text-xs text-muted-foreground mb-2">
            Send messages to your local Agent via HTTP POST:
          </p>
          <pre className="text-xs bg-secondary/30 rounded p-3 font-mono overflow-x-auto">
{`POST http://localhost:port/bot/webhook/{channel_id}
Content-Type: application/json

{
  "sender": "user_name",
  "content": "your message here"
}`}
          </pre>
        </div>
      </div>
    </div>
  );
}
