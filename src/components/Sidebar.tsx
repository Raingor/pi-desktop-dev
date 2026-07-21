import React, { useMemo } from 'react';
import { Typography, Button, Space, Empty, Badge, Collapse } from 'antd';
import {
  MessageOutlined,
  ReloadOutlined,
  PlusOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../stores/appStore';
import type { SessionEntry } from '../types';

const { Text } = Typography;

/** Extract a friendly display name from a cwd path */
function cwdDisplayName(cwd: string): string {
  // Try last 2 path components for context
  const parts = cwd.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }
  return parts[parts.length - 1] || cwd;
}

/** Just return the full cwd for tooltip display */
function cwdTooltip(cwd: string): string {
  return cwd;
}

interface GroupedSessions {
  cwd: string;
  displayName: string;
  sessions: SessionEntry[];
  latestTimestamp: string;
}

const Sidebar: React.FC = () => {
  const { sessions, newSession, loadSessions, switchSession, currentSessionId } = useAppStore();

  // Group sessions by cwd, sorted by latest activity
  const groups = useMemo(() => {
    const map = new Map<string, SessionEntry[]>();
    for (const s of sessions) {
      const key = s.cwd || '/';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }

    const result: GroupedSessions[] = [];
    for (const [cwd, sess] of map) {
      // Sort sessions within group by timestamp descending
      sess.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      result.push({
        cwd,
        displayName: cwdDisplayName(cwd),
        sessions: sess,
        latestTimestamp: sess[0].timestamp,
      });
    }

    // Sort groups by latest session timestamp descending
    result.sort((a, b) => b.latestTimestamp.localeCompare(a.latestTimestamp));
    return result;
  }, [sessions]);

  // Default: expand the group matching current session, or the first group
  const defaultActiveKey = useMemo(() => {
    if (currentSessionId) {
      const s = sessions.find((s) => s.path === currentSessionId);
      if (s) return [s.cwd || '/'];
    }
    return groups.length > 0 ? [groups[0].cwd] : [];
  }, [currentSessionId, sessions, groups]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '12px 0',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '0 12px 12px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text strong style={{ fontSize: 13 }}>Sessions</Text>
        <Space size={2}>
          <Button
            size="small"
            type="text"
            icon={<PlusOutlined />}
            onClick={newSession}
            title="New Chat"
          />
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined />}
            onClick={loadSessions}
            title="Refresh"
          />
        </Space>
      </div>

      {/* Groups */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {groups.length === 0 ? (
          <Empty
            description="No sessions"
            style={{ padding: 24, marginTop: 24 }}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Collapse
            ghost
            expandIconPosition="end"
            defaultActiveKey={defaultActiveKey}
            style={{ border: 'none' }}
            items={groups.map((group) => ({
              key: group.cwd,
              label: (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingRight: 4,
                  }}
                >
                  <Space size={6}>
                    <FolderOutlined style={{ fontSize: 13, color: '#8c8c8c' }} />
                    <Text
                      style={{ fontSize: 12, fontWeight: 500 }}
                      ellipsis={{ tooltip: cwdTooltip(group.cwd) }}
                    >
                      {group.displayName}
                    </Text>
                  </Space>
                  <Space size={6}>
                    <Badge
                      count={group.sessions.length}
                      style={{
                        fontSize: 10,
                        height: 16,
                        minWidth: 16,
                        lineHeight: '16px',
                        padding: '0 4px',
                        backgroundColor: '#e6e6e6',
                        color: '#666',
                        fontWeight: 400,
                        boxShadow: 'none',
                      }}
                      showZero={false}
                    />
                    <Text
                      type="secondary"
                      style={{ fontSize: 10, minWidth: 36, textAlign: 'right' }}
                    >
                      {formatDate(group.latestTimestamp)}
                    </Text>
                  </Space>
                </div>
              ),
              children: (
                <div style={{ marginLeft: -8, marginRight: -12 }}>
                  {group.sessions.slice(0, 20).map((session) => {
                    const isActive = currentSessionId === session.path;
                    return (
                      <div
                        key={session.path}
                        onClick={() => switchSession(session.path)}
                        style={{
                          cursor: 'pointer',
                          padding: '6px 12px 6px 28px',
                          background: isActive ? '#e6f4ff' : 'transparent',
                          borderRadius: 4,
                          margin: '1px 4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            (e.currentTarget as HTMLElement).style.background = '#f5f5f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                          }
                        }}
                      >
                        <MessageOutlined
                          style={{
                            fontSize: 12,
                            color: isActive ? '#1677ff' : '#bbb',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{
                              fontSize: 12,
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: isActive ? '#1677ff' : undefined,
                            }}
                            title={session.id}
                          >
                            {session.id.length > 20
                              ? session.id.slice(0, 20) + '…'
                              : session.id}
                          </Text>
                          <Text
                            type="secondary"
                            style={{ fontSize: 10, display: 'block' }}
                          >
                            {session.timestamp
                              ? new Date(session.timestamp).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </Text>
                        </div>
                      </div>
                    );
                  })}
                  {group.sessions.length > 20 && (
                    <div style={{ padding: '4px 12px 4px 28px' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        +{group.sessions.length - 20} more
                      </Text>
                    </div>
                  )}
                </div>
              ),
            }))}
          />
        )}
      </div>
    </div>
  );
};

/** Format a timestamp as relative or short date */
function formatDate(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yest';
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default Sidebar;
