import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Segmented, Table, Tabs, Card, Statistic, Row, Col, Button, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { ReloadOutlined, DollarOutlined } from '@ant-design/icons';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { usePiConfigStore } from '../stores/piConfigStore';
import { formatTokens, formatNumber, formatTokensShort, formatCostShort, formatCostShortCNY } from '../lib/utils';

const { Text } = Typography;
type RangeKey = 'today' | '7d' | '30d' | 'custom';

function getDateRange(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  const from = new Date(now);
  if (key === 'today') return { from: to, to };
  if (key === '7d') { from.setDate(from.getDate() - 7); return { from: from.toISOString().split('T')[0], to }; }
  if (key === '30d') { from.setDate(from.getDate() - 30); return { from: from.toISOString().split('T')[0], to }; }
  return { from: to, to };
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { usage, refreshUsage, initialized } = usePiConfigStore();
  const [range, setRange] = useState<RangeKey>('today');
  const [currency, setCurrency] = useState<'USD' | 'CNY'>('USD');

  const fetchData = useCallback(() => {
    if (!initialized) return;
    const { from, to } = getDateRange(range);
    refreshUsage(from, to);
  }, [initialized, range, refreshUsage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!initialized) return;
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [initialized, fetchData]);

  const chartData = (range === 'today' ? usage?.hourlyBreakdown : usage?.dailyBreakdown) ?? [];
  const areaData = chartData.map((d: any) => ({
    date: range === 'today' ? (d.hour?.slice(-5) ?? '') : fmtDate(d.date ?? ''),
    input: Math.round((d.input ?? 0) / 1000),
    output: Math.round((d.output ?? 0) / 1000),
    cacheRead: Math.round((d.cacheRead ?? 0) / 1000),
    cacheWrite: Math.round((d.cacheWrite ?? 0) / 1000),
    cost: parseFloat((d.cost ?? 0).toFixed(4)),
    requests: d.requests ?? 0,
  }));

  const requestLogColumns = [
    { title: t('dashboard.time'), dataIndex: 'timestamp', key: 'time', render: (t: string) => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t}</span> },
    { title: t('dashboard.provider'), dataIndex: 'providerId', key: 'provider', render: (t: string) => <span style={{ color: 'var(--text-primary)' }}>{t}</span> },
    { title: t('dashboard.model'), dataIndex: 'modelId', key: 'model', render: (t: string) => <span style={{ color: 'var(--text-primary)' }}>{t}</span> },
    { title: t('dashboard.input'), dataIndex: 'input', key: 'input', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatTokensShort(v)}</span> },
    { title: t('dashboard.output'), dataIndex: 'output', key: 'output', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatTokensShort(v)}</span> },
    { title: t('dashboard.cost'), dataIndex: 'cost', key: 'cost', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-purple)' }}>{currency === 'CNY' ? formatCostShortCNY(v) : formatCostShort(v)}</span> },
    { title: t('dashboard.req'), dataIndex: 'requests', key: 'requests', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{v}</span> },
  ];

  const providerColumns = [
    { title: t('dashboard.provider'), dataIndex: 'providerId', key: 'provider', render: (t: string) => <span style={{ color: 'var(--text-primary)' }}>{t}</span> },
    { title: t('dashboard.tokens'), dataIndex: 'totalTokens', key: 'tokens', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatTokensShort(v)}</span> },
    { title: t('dashboard.input'), dataIndex: 'totalInput', key: 'input', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatTokensShort(v)}</span> },
    { title: t('dashboard.output'), dataIndex: 'totalOutput', key: 'output', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatTokensShort(v)}</span> },
    { title: t('dashboard.cost'), dataIndex: 'totalCost', key: 'cost', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-purple)' }}>{currency === 'CNY' ? formatCostShortCNY(v) : formatCostShort(v)}</span> },
    { title: t('dashboard.requests_'), dataIndex: 'totalRequests', key: 'requests', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{v}</span> },
    { title: t('dashboard.models'), dataIndex: 'modelCount', key: 'models', render: (v: number) => <span style={{ color: 'var(--text-secondary)' }}>{v}</span> },
  ];

  const modelColumns = [
    { title: t('dashboard.model'), dataIndex: 'modelId', key: 'model', render: (t: string) => <span style={{ color: 'var(--text-primary)' }}>{t}</span> },
    { title: t('dashboard.provider'), dataIndex: 'providerId', key: 'provider', render: (t: string) => <span style={{ color: 'var(--text-secondary)' }}>{t}</span> },
    { title: t('dashboard.tokens'), dataIndex: 'totalTokens', key: 'tokens', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatTokensShort(v)}</span> },
    { title: t('dashboard.input'), dataIndex: 'totalInput', key: 'input', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatTokensShort(v)}</span> },
    { title: t('dashboard.output'), dataIndex: 'totalOutput', key: 'output', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatTokensShort(v)}</span> },
    { title: t('dashboard.cost'), dataIndex: 'totalCost', key: 'cost', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-purple)' }}>{currency === 'CNY' ? formatCostShortCNY(v) : formatCostShort(v)}</span> },
    { title: t('dashboard.requests_'), dataIndex: 'totalRequests', key: 'requests', render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{v}</span> },
  ];

  const tabItems = [
    { key: 'log', label: t('dashboard.requestLog'), children: <Table dataSource={usage?.requestLog ?? []} columns={requestLogColumns} rowKey={(_, i) => String(i)} pagination={{ pageSize: 20, size: 'small' }} size="small" style={{ marginTop: 8 }} /> },
    { key: 'provider', label: t('dashboard.providerStats'), children: <Table dataSource={usage?.providerStats ?? []} columns={providerColumns} rowKey={(_, i) => String(i)} pagination={false} size="small" style={{ marginTop: 8 }} /> },
    { key: 'model', label: t('dashboard.modelStats'), children: <Table dataSource={usage?.modelStats ?? []} columns={modelColumns} rowKey={(_, i) => String(i)} pagination={false} size="small" style={{ marginTop: 8 }} /> },
  ];

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Text style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{t('dashboard.title')}</Text>
          <Text style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
            {usage ? t('dashboard.requests', { count: formatNumber(usage.totalRequests) }) : ''}
          </Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button size="small" type="text" onClick={() => setCurrency(currency === 'USD' ? 'CNY' : 'USD')} style={{ color: 'var(--text-muted)' }}>
            <DollarOutlined /> {currency}
          </Button>
          <Tooltip title={t('common.refresh')}>
            <Button size="small" type="text" icon={<ReloadOutlined />} onClick={fetchData} style={{ color: 'var(--text-muted)' }} />
          </Tooltip>
          <Segmented
            value={range}
            onChange={(v) => setRange(v as RangeKey)}
            options={[
              { value: 'today', label: t('dashboard.today') },
              { value: '7d', label: t('dashboard.sevenDays') },
              { value: '30d', label: t('dashboard.thirtyDays') },
            ]}
            size="small"
          />
        </div>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Statistic title={<Text style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('dashboard.totalTokens')}</Text>}
              value={usage?.totalTokens ?? 0} valueStyle={{ fontSize: 20, color: 'var(--text-primary)' }}
              suffix={<Text style={{ fontSize: 11, color: 'var(--text-muted)' }}>≈ {formatTokens(usage?.totalTokens ?? 0)}</Text>} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Statistic title={<Text style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('dashboard.requests_')}</Text>}
              value={usage?.totalRequests ?? 0} valueStyle={{ fontSize: 20, color: 'var(--text-primary)' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Statistic title={<Text style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('dashboard.totalCost')}</Text>}
              value={usage?.totalCost ?? 0} valueStyle={{ fontSize: 20, color: 'var(--accent-purple)' }}
              precision={4} prefix={currency === 'CNY' ? '¥' : '$'} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Statistic title={<Text style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('dashboard.cacheHitRate')}</Text>}
              value={usage?.cacheHitRate ?? 0} valueStyle={{ fontSize: 20, color: 'var(--accent-teal)' }}
              suffix="%" />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', marginBottom: 20 }}>
        <Text style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 12 }}>{t('dashboard.usageTrend')}</Text>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={areaData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <RechartsTooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }} />
            <Area type="monotone" dataKey="input" stroke="#00d4aa" fill="none" strokeWidth={2} dot={false} name={t('dashboard.input')} />
            <Area type="monotone" dataKey="output" stroke="#7c5cfc" fill="none" strokeWidth={2} dot={false} name={t('dashboard.output')} />
            <Area type="monotone" dataKey="cacheRead" stroke="#3b82f6" fill="none" strokeWidth={2} strokeDasharray="4 2" dot={false} name={t('dashboard.cacheHit')} />
            <Area type="monotone" dataKey="cacheWrite" stroke="#f59e0b" fill="none" strokeWidth={2} strokeDasharray="2 2" dot={false} name={t('dashboard.cacheCreate')} />
            <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 8 }} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Tabs items={tabItems} size="small" />
    </div>
  );
};

export default DashboardPage;