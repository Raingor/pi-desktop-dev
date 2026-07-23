import React, { useMemo, useState } from 'react';
import { Typography, Button, Space, Empty, Badge, Collapse, Dropdown, message, MenuProps, Modal, Input, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  MessageOutlined,
  ReloadOutlined,
  PlusOutlined,
  FolderOutlined,
  DeleteOutlined,
  EditOutlined,
  MenuFoldOutlined,
  ImportOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../stores/appStore';
import { piDeleteSession } from '../services/piConfigService';
import type { SessionEntry } from '../types';

const { Text } = Typography;

function cwdDisplayName(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  return parts[parts.length - 1] || cwd;
}

function cwdTooltip(cwd: string): string {
  return cwd;
}

function sessionDisplayName(session: SessionEntry): string {
  if (session.sessionName && session.sessionName.trim().length > 0) {
    return session.sessionName.length > 30
      ? session.sessionName.slice(0, 30) + '…'
      : session.sessionName;
  }
  return session.id.length > 20
    ? session.id.slice(0, 20) + '…'
    : session.id;
}

interface GroupedSessions {
  cwd: string;
  displayName: string;
  sessions: SessionEntry[];
  latestTimestamp: string;
}

const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const {
    sessions,
    newSession,
    loadSessions,
    switchSession,
    currentSessionId,
    renameSession,
    setSidebarCollapsed,
    setActiveView,
    loadExternalSessions,
  } = useAppStore();

  const [renameTarget, setRenameTarget] = useState<SessionEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const handleTrash = async (path: string) => {
    try {
      await piDeleteSession(path);
      message.success(t('sidebar.movedToTrash'));
      loadSessions();
    } catch (e) {
      console.error(e);
    }
  };

  const openRename = (session: SessionEntry) => {
    setRenameTarget(session);
    setRenameValue(session.sessionName || '');
    setRenaming(false);
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    if (!renameValue.trim()) {
      message.error(t('sidebar.nameRequired'));
      return;
    }
    setRenaming(true);
    try {
      await renameSession(renameTarget.path, renameValue.trim());
      message.success(t('sidebar.renamed'));
      setRenameTarget(null);
    } catch (e) {
      message.error(t('sidebar.renameFailed'));
    } finally {
      setRenaming(false);
    }
  };

  const openImportWizard = () => {
    loadExternalSessions();
    setActiveView('sessions');
  };

  const groups = useMemo(() => {
    const map = new Map<string, SessionEntry[]>();
    for (const s of sessions) {
      const key = s.cwd || '/';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }

    const result: GroupedSessions[] = [];
    for (const [cwd, sess] of map) {
      sess.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      result.push({
        cwd,
        displayName: cwdDisplayName(cwd),
        sessions: sess,
        latestTimestamp: sess[0].timestamp,
      });
    }

    result.sort((a, b) => b.latestTimestamp.localeCompare(a.latestTimestamp));
    return result;
  }, [sessions]);

  const defaultActiveKey = useMemo(() => {
    if (currentSessionId) {
      const s = sessions.find((s) => s.path === currentSessionId);
      if (s) return [s.cwd || '/'];
    }
    return groups.length > 0 ? [groups[0].cwd] : [];
  }, [currentSessionId, sessions, groups]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          {t('sidebar.sessions')}
        </Text>
        <Space size={2}>
          <Tooltip title={t('sidebar.importExternal')}>
            <Button size="small" type="text" icon={<ImportOutlined style={{ fontSize: 13, color: 'var(--text-muted)' }} />}
              onClick={openImportWizard} style={{ color: 'var(--text-muted)', borderRadius: 6 }} />
          </Tooltip>
          <Button size="small" type="text" icon={<PlusOutlined style={{ fontSize: 13, color: 'var(--text-muted)' }} />}
            onClick={newSession} title={t('sidebar.newChat')} style={{ color: 'var(--text-muted)', borderRadius: 6 }} />
          <Button size="small" type="text" icon={<ReloadOutlined style={{ fontSize: 13, color: 'var(--text-muted)' }} />}
            onClick={loadSessions} title={t('common.refresh')} style={{ color: 'var(--text-muted)', borderRadius: 6 }} />
          <Tooltip title={t('sidebar.collapse')}>
            <Button size="small" type="text" icon={<MenuFoldOutlined style={{ fontSize: 13, color: 'var(--text-muted)' }} />}
              onClick={() => setSidebarCollapsed(true)} style={{ color: 'var(--text-muted)', borderRadius: 6 }} />
          </Tooltip>
        </Space>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
        {groups.length === 0 ? (
          <Empty description={<span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('sidebar.noSessions')}</span>}
            style={{ padding: 32, marginTop: 16 }} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Collapse ghost expandIconPosition="end" defaultActiveKey={defaultActiveKey}
            style={{ border: 'none', padding: '0 6px' }}
            items={groups.map((group) => ({
              key: group.cwd,
              label: (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4, minWidth: 0 }}>
                  <Space size={6} style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <FolderOutlined style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }} />
                    <Text style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }} ellipsis={{ tooltip: cwdTooltip(group.cwd) }}>
                      {group.displayName}
                    </Text>
                  </Space>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <Badge count={group.sessions.length}
                      style={{ fontSize: 9, height: 15, minWidth: 15, lineHeight: '15px', padding: '0 5px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', fontWeight: 400, boxShadow: 'none', border: '1px solid var(--border-color)', borderRadius: 4 }}
                      showZero={false} />
                    <Text style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDateRelative(group.latestTimestamp, t)}</Text>
                  </div>
                </div>
              ),
              children: (
                <div style={{ marginLeft: -8, marginRight: -12 }}>
                  {group.sessions.slice(0, 20).map((session) => {
                    const isActive = currentSessionId === session.path;
                    const menuItems: MenuProps['items'] = [
                      {
                        key: 'rename',
                        icon: <EditOutlined style={{ fontSize: 12 }} />,
                        label: t('sidebar.rename'),
                        onClick: (e) => {
                          e.domEvent.stopPropagation();
                          openRename(session);
                        },
                      },
                      { type: 'divider' as const },
                      {
                        key: 'trash',
                        icon: <DeleteOutlined style={{ fontSize: 12, color: 'var(--accent-danger)' }} />,
                        label: t('sidebar.moveToTrash'),
                        danger: true,
                        onClick: (e) => {
                          e.domEvent.stopPropagation();
                          handleTrash(session.path);
                        },
                      },
                    ];
                    return (
                      <Dropdown key={session.path} menu={{ items: menuItems }} trigger={['contextMenu']}>
                        <div onClick={() => switchSession(session.path)}
                          style={{ cursor: 'pointer', padding: '7px 12px 7px 28px', background: isActive ? 'var(--accent-teal-dim)' : 'transparent', borderRadius: 6, margin: '2px 6px', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s ease', border: isActive ? '1px solid rgba(0,212,170,0.15)' : '1px solid transparent' }}
                          onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; }}
                          onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                          <MessageOutlined style={{ fontSize: 11, color: isActive ? 'var(--accent-teal)' : 'var(--text-muted)', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isActive ? 'var(--accent-teal)' : 'var(--text-secondary)', fontWeight: isActive ? 500 : 400 }} title={session.id}>
                              {sessionDisplayName(session)}
                            </Text>
                            <Text style={{ fontSize: 10, display: 'block', color: 'var(--text-muted)', marginTop: 1 }}>
                              {session.timestamp ? new Date(session.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                            </Text>
                          </div>
                        </div>
                      </Dropdown>
                    );
                  })}
                  {group.sessions.length > 20 && (
                    <div style={{ padding: '6px 12px 6px 28px' }}>
                      <Text style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('common.more', { count: group.sessions.length - 20 })}</Text>
                    </div>
                  )}
                </div>
              ),
            }))}
          />
        )}
      </div>

      {/* Rename modal */}
      <Modal
        title={t('sidebar.renameTitle')}
        open={!!renameTarget}
        onOk={submitRename}
        onCancel={() => setRenameTarget(null)}
        confirmLoading={renaming}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        destroyOnHidden
        okButtonProps={{ style: { background: 'var(--accent-teal)', borderColor: 'var(--accent-teal)', color: '#0a0a0f' } }}
      >
        <Input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={submitRename}
          placeholder={t('sidebar.renamePlaceholder')}
          maxLength={80}
          showCount
        />
      </Modal>
    </div>
  );
};

function formatDateRelative(ts: string, t: (key: string, opts?: any) => string): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return t('common.today');
  if (diffDays === 1) return t('common.yest');
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default Sidebar;