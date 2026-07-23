import React, { useState, useEffect, useRef } from 'react';
import { Typography, Collapse, Input, Empty, Popconfirm, Tag, Button, Space, Tooltip, Tabs, message, Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import { DeleteOutlined, SearchOutlined, FolderOutlined, MessageOutlined, RestOutlined, UndoOutlined, ExclamationCircleOutlined, ImportOutlined, ReloadOutlined } from '@ant-design/icons';
import { piListSessionsDetailed, piDeleteSession, piListTrash, piRestoreFromTrash, piPermanentlyDelete, piAutoCleanup } from '../services/piConfigService';
import { useAppStore } from '../stores/appStore';
import type { ProjectGroup, DetailedSessionEntry, TrashEntry, ExternalSession } from '../types';

const { Text } = Typography;

const TOOL_COLORS: Record<string, string> = {
  opencode: 'var(--accent-teal)',
  claude_code: 'var(--accent-purple)',
  generic: 'var(--text-muted)',
};

function formatDate(ts: string, t: (key: string, opts?: any) => string): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return t('common.today');
  if (diff === 1) return t('common.yest');
  if (diff < 7) return `${diff}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

const SessionsPage: React.FC = () => {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const [search, setSearch] = useState('');
  const [trashSearch, setTrashSearch] = useState('');
  const [activeTab, setActiveTab] = useState('sessions');
  const [selectedTrash, setSelectedTrash] = useState<Set<string>>(new Set());

  // External-agent import wizard state.
  const { externalSessions, loadExternalSessions, importExternalSession } = useAppStore();
  const [importing, setImporting] = useState<string | null>(null);
  const [importSearch, setImportSearch] = useState('');

  // Ref to the project search input — focused when Cmd/Ctrl+K is pressed.
  const searchInputRef = useRef<any>(null);
  useEffect(() => {
    const focusSearch = () => {
      // Slight delay so the view has time to mount if just switched into.
      setTimeout(() => {
        searchInputRef.current?.focus?.();
        const input = searchInputRef.current?.input as HTMLInputElement | undefined;
        input?.select?.();
      }, 50);
    };
    window.addEventListener('pi:cmdk-focus-search', focusSearch);
    return () => window.removeEventListener('pi:cmdk-focus-search', focusSearch);
  }, []);

  const loadSessions = async () => {
    try {
      await piAutoCleanup().catch(() => {});
      const data = await piListSessionsDetailed();
      setGroups(data);
    } catch (e) { console.error(e); }
  };

  const loadTrash = async () => {
    try {
      const data = await piListTrash();
      setTrash(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    loadSessions();
    loadTrash();
    loadExternalSessions();
  }, [loadExternalSessions]);

  const handleImportExternal = async (session: ExternalSession) => {
    setImporting(session.filePath);
    try {
      await importExternalSession(session.filePath, session.tool);
      message.success(t('sessions.importSuccess'));
      loadSessions();
    } catch (e) {
      message.error(t('sessions.importFailed'));
      console.error(e);
    } finally {
      setImporting(null);
    }
  };

  const filteredExternal = externalSessions.filter((s) =>
    !importSearch ||
    s.project.toLowerCase().includes(importSearch.toLowerCase()) ||
    s.preview.toLowerCase().includes(importSearch.toLowerCase()) ||
    s.tool.toLowerCase().includes(importSearch.toLowerCase())
  );

  const handleDelete = async (path: string) => {
    try {
      await piDeleteSession(path);
      message.success(t('sessions.movedToTrash'));
      loadSessions();
      loadTrash();
    } catch (e) { console.error(e); }
  };

  const handleRestore = async (trashPath: string) => {
    try {
      await piRestoreFromTrash(trashPath);
      message.success(t('sessions.restored'));
      loadTrash();
      loadSessions();
    } catch (e) { console.error(e); }
  };

  const handlePermanentDelete = async (trashPath: string) => {
    try {
      await piPermanentlyDelete(trashPath);
      message.success(t('sessions.permanentlyDeleted'));
      loadTrash();
    } catch (e) { console.error(e); }
  };

  // ─── Batch operations ──────────────────────────────────

  const filteredTrash = trash.filter((t) =>
    !trashSearch || t.fileName.toLowerCase().includes(trashSearch.toLowerCase()) || t.sessionId.toLowerCase().includes(trashSearch.toLowerCase())
  );
  const filteredPaths = filteredTrash.map((t) => t.trashPath);
  const allSelected = filteredPaths.length > 0 && filteredPaths.every((p) => selectedTrash.has(p));

  const toggleSelect = (path: string) => {
    setSelectedTrash((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedTrash(new Set());
    } else {
      setSelectedTrash(new Set(filteredPaths));
    }
  };

  const handleBatchRestore = async () => {
    const selected = Array.from(selectedTrash);
    let count = 0;
    for (const path of selected) {
      try { await piRestoreFromTrash(path); count++; } catch {}
    }
    message.success(t('sessions.batchRestored', { count }));
    setSelectedTrash(new Set());
    loadTrash();
    loadSessions();
  };

  const handleBatchDelete = async () => {
    const selected = Array.from(selectedTrash);
    let count = 0;
    for (const path of selected) {
      try { await piPermanentlyDelete(path); count++; } catch {}
    }
    message.success(t('sessions.batchDeleted', { count }));
    setSelectedTrash(new Set());
    loadTrash();
  };

  const filtered = groups.filter((g) =>
    !search || g.projectName.toLowerCase().includes(search.toLowerCase())
  );

  const tabItems = [
    {
      key: 'sessions',
      label: <span>{t('sessions.sessions')} {groups.length > 0 && <Tag style={{ fontSize: 10, marginLeft: 4 }}>{groups.reduce((s, g) => s + g.totalSessions, 0)}</Tag>}</span>,
      children: (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{t('sessions.sessions')}</Text>
            <Input.Search ref={searchInputRef} placeholder={t('sessions.searchProjects')} value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} size="small"
              prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />} />
          </div>
          {filtered.length === 0 ? (
            <Empty description={<span style={{ color: 'var(--text-muted)' }}>{t('sessions.noSessions')}</span>} />
          ) : (
            <Collapse ghost expandIconPosition="end" defaultActiveKey={[filtered[0]?.projectPath]} style={{ border: 'none' }}
              items={filtered.map((group) => ({
                key: group.projectPath,
                label: (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4 }}>
                    <Space size={6}>
                      <FolderOutlined style={{ fontSize: 12, color: 'var(--text-muted)' }} />
                      <Text style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{group.projectName}</Text>
                    </Space>
                    <Space size={6}>
                      <Tag style={{ fontSize: 10, borderColor: 'var(--border-color)', color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>{group.totalSessions}</Tag>
                      <Text style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatDate(group.lastActive, t)}</Text>
                    </Space>
                  </div>
                ),
                children: (
                  <div>
                    {group.sessions.slice(0, 50).map((session) => (
                      <SessionRow key={session.filePath} session={session} onDelete={handleDelete} />
                    ))}
                    {group.sessions.length > 50 && (
                      <div style={{ padding: '4px 12px 4px 28px' }}>
                        <Text style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('common.more', { count: group.sessions.length - 50 })}</Text>
                      </div>
                    )}
                  </div>
                ),
              }))}
            />
          )}
        </>
      ),
    },
    {
      key: 'trash',
      label: <span><RestOutlined style={{ marginRight: 4 }} />{t('sessions.trash')} {trash.length > 0 && <Tag style={{ fontSize: 10, marginLeft: 4, background: 'var(--accent-danger-dim)', color: 'var(--accent-danger)', borderColor: 'rgba(255,107,107,0.3)' }}>{trash.length}</Tag>}</span>,
      children: (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t('sessions.trashDesc')}
            </Text>
            <Input.Search placeholder={t('sessions.searchTrash')} value={trashSearch}
              onChange={(e) => setTrashSearch(e.target.value)} style={{ width: 200 }} size="small" />
          </div>

          {/* Batch action bar */}
          {selectedTrash.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 8, borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
              <Checkbox checked={allSelected} indeterminate={selectedTrash.size > 0 && !allSelected} onChange={toggleSelectAll} />
              <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('common.selected', { count: selectedTrash.size })}</Text>
              <Popconfirm title={t('sessions.batchRestoreConfirm', { count: selectedTrash.size })} onConfirm={handleBatchRestore} okText={t('common.restore')} cancelText={t('common.cancel')}>
                <Button size="small" icon={<UndoOutlined />} style={{ color: 'var(--accent-teal)', borderColor: 'var(--accent-teal)' }}>{t('sessions.restoreAll')}</Button>
              </Popconfirm>
              <Popconfirm title={t('sessions.batchDeleteConfirm', { count: selectedTrash.size })} onConfirm={handleBatchDelete} okText={t('sessions.deleteAll')} cancelText={t('common.cancel')}>
                <Button size="small" danger icon={<DeleteOutlined />}>{t('sessions.deleteAll')}</Button>
              </Popconfirm>
            </div>
          )}

          {filteredTrash.length === 0 ? (
            <Empty description={<span style={{ color: 'var(--text-muted)' }}>{t('sessions.trashIsEmpty')}</span>} />
          ) : (
            <div>
              {/* Select all header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px 8px 12px', borderBottom: '1px solid var(--border-color)', marginBottom: 4 }}>
                <Checkbox checked={allSelected} indeterminate={selectedTrash.size > 0 && !allSelected} onChange={toggleSelectAll} />
                <Text style={{ fontSize: 11, color: 'var(--text-muted)' }}>{allSelected ? t('sessions.deselectAll') : t('sessions.selectAll')}</Text>
              </div>
              {filteredTrash.map((entry) => (
                <TrashRow key={entry.trashPath} entry={entry}
                  selected={selectedTrash.has(entry.trashPath)}
                  onToggle={() => toggleSelect(entry.trashPath)}
                  onRestore={handleRestore} onPermanentDelete={handlePermanentDelete} />
              ))}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'import',
      label: <span><ImportOutlined style={{ marginRight: 4 }} />{t('sessions.import')} {externalSessions.length > 0 && <Tag style={{ fontSize: 10, marginLeft: 4, background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)', borderColor: 'rgba(124,92,252,0.3)' }}>{externalSessions.length}</Tag>}</span>,
      children: (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <Text style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{t('sessions.importExternal')}</Text>
              <Text style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('sessions.importDesc')}</Text>
            </div>
            <Space size={8}>
              <Input.Search placeholder={t('sessions.searchImport')} value={importSearch}
                onChange={(e) => setImportSearch(e.target.value)} style={{ width: 220 }} size="small"
                prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />} />
              <Tooltip title={t('common.refresh')}>
                <Button size="small" icon={<ReloadOutlined />} onClick={() => loadExternalSessions()} style={{ color: 'var(--text-muted)' }} />
              </Tooltip>
            </Space>
          </div>

          {/* Tool filter badges */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {['opencode', 'claude_code'].map((tool) => {
              const count = externalSessions.filter((s) => s.tool === tool).length;
              return (
                <Tag key={tool} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 12, background: 'var(--bg-surface)', color: TOOL_COLORS[tool] || 'var(--text-muted)', border: `1px solid ${TOOL_COLORS[tool] || 'var(--border-color)'}40` }}>
                  {tool === 'claude_code' ? 'Claude Code' : 'OpenCode'} · {count}
                </Tag>
              );
            })}
          </div>

          {filteredExternal.length === 0 ? (
            <Empty description={<span style={{ color: 'var(--text-muted)' }}>{t('sessions.noExternalSessions')}</span>} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredExternal.map((session) => (
                <ExternalSessionRow
                  key={session.filePath}
                  session={session}
                  importing={importing === session.filePath}
                  onImport={() => handleImportExternal(session)}
                />
              ))}
            </div>
          )}
        </>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="small" />
    </div>
  );
};

const ExternalSessionRow: React.FC<{ session: ExternalSession; importing: boolean; onImport: () => void }> = ({ session, importing, onImport }) => {
  const { t } = useTranslation();
  const color = TOOL_COLORS[session.tool] || TOOL_COLORS.generic;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', transition: 'all 0.15s' }}>
      <Tag style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: color + '18', color, border: `1px solid ${color}40`, flexShrink: 0, textTransform: 'capitalize' }}>
        {session.tool === 'claude_code' ? 'Claude' : session.tool === 'opencode' ? 'OpenCode' : session.tool}
      </Tag>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 500 }} title={session.project}>
          {session.project || t('sessions.untitledProject')}
        </Text>
        <Text style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
          {session.preview || '—'}
        </Text>
        <Space size={6} style={{ marginTop: 2 }}>
          {session.timestamp && <Text style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(session.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>}
          <Text style={{ fontSize: 10, color: 'var(--text-muted)' }}>{session.sessionId.slice(0, 8)}</Text>
        </Space>
      </div>
      <Button
        size="small"
        type="primary"
        loading={importing}
        icon={<ImportOutlined />}
        onClick={onImport}
        style={{ flexShrink: 0, background: 'var(--accent-teal)', borderColor: 'var(--accent-teal)', color: '#0a0a0f', borderRadius: 6 }}
      >
        {t('sessions.importBtn')}
      </Button>
    </div>
  );
};

const SessionRow: React.FC<{ session: DetailedSessionEntry; onDelete: (path: string) => void }> = ({ session, onDelete }) => {
  const { t } = useTranslation();
  return (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 28px', margin: '2px 6px', borderRadius: 6, transition: 'all 0.15s', cursor: 'default' }}>
    <MessageOutlined style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }} title={session.id}>
        {session.name || session.id.slice(0, 25) + (session.id.length > 25 ? '…' : '')}
      </Text>
      <Space size={6} style={{ marginTop: 1 }}>
        <Text style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {session.timestamp ? new Date(session.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
        </Text>
        <Text style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('common.msgs', { count: session.messageCount })}</Text>
        {session.provider && session.provider !== 'unknown' && (
          <Tag style={{ fontSize: 9, borderColor: 'var(--border-color)', color: 'var(--text-muted)', background: 'var(--bg-surface)', lineHeight: '16px', padding: '0 4px' }}>{session.provider}</Tag>
        )}
        {session.duration ? <Text style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatDuration(session.duration)}</Text> : null}
      </Space>
    </div>
    <Popconfirm title={t('sessions.moveToTrashConfirm')} onConfirm={() => onDelete(session.filePath)} okText={t('sessions.trashBtn')} cancelText={t('common.cancel')}>
      <Tooltip title={t('sessions.moveToTrash')}>
        <Button type="text" size="small" icon={<DeleteOutlined style={{ fontSize: 11 }} />} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </Tooltip>
    </Popconfirm>
  </div>
  );
};

const TrashRow: React.FC<{
  entry: TrashEntry;
  selected: boolean;
  onToggle: () => void;
  onRestore: (path: string) => void;
  onPermanentDelete: (path: string) => void;
}> = ({ entry, selected, onToggle, onRestore, onPermanentDelete }) => {
  const { t } = useTranslation();
  const daysInTrash = entry.trashedAt ? Math.floor((Date.now() - new Date(entry.trashedAt).getTime()) / 86400000) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 12px', margin: '2px 6px', borderRadius: 6, border: selected ? '1px solid var(--accent-teal)' : '1px solid var(--border-color)', background: selected ? 'var(--accent-teal-dim)' : 'var(--bg-secondary)', transition: 'all 0.15s' }}>
      <Checkbox checked={selected} onChange={onToggle} />
      <ExclamationCircleOutlined style={{ fontSize: 12, color: 'var(--accent-danger)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }} title={entry.sessionId}>
          {entry.sessionName || entry.sessionId.slice(0, 25) + (entry.sessionId.length > 25 ? '…' : '')}
        </Text>
        <Space size={6} style={{ marginTop: 1 }}>
          <Text style={{ fontSize: 10, color: 'var(--text-muted)' }}>{entry.fileName}</Text>
          <Text style={{ fontSize: 10, color: 'var(--accent-danger)' }}>{t('common.dInTrash', { count: daysInTrash })}</Text>
          {entry.messageCount > 0 && <Text style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('common.msgs', { count: entry.messageCount })}</Text>}
        </Space>
      </div>
      <Space size={4}>
        <Tooltip title={t('sessions.restoreTooltip')}>
          <Button type="text" size="small" icon={<UndoOutlined />} onClick={() => onRestore(entry.trashPath)} style={{ color: 'var(--accent-teal)' }} />
        </Tooltip>
        <Popconfirm title={t('sessions.permanentlyDeleteConfirm')} onConfirm={() => onPermanentDelete(entry.trashPath)} okText={t('common.delete')} cancelText={t('common.cancel')}>
          <Tooltip title={t('sessions.deleteTooltip')}>
            <Button type="text" size="small" icon={<DeleteOutlined />} style={{ color: 'var(--accent-danger)' }} />
          </Tooltip>
        </Popconfirm>
      </Space>
    </div>
  );
};

export default SessionsPage;