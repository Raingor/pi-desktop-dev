import React, { useEffect, useState } from 'react';
import { Typography, Collapse, Empty, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { piReadMemoryFiles } from '../services/piConfigService';
import type { MemoryFile } from '../types';

const { Text } = Typography;

const MemoryPage: React.FC = () => {
  const { t } = useTranslation();
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    piReadMemoryFiles()
      .then(setFiles)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Spin />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <Text style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 20 }}>
        {t('memory.title')}
      </Text>
      {files.length === 0 ? (
        <Empty description={<span style={{ color: 'var(--text-muted)' }}>{t('memory.noFiles')}</span>} />
      ) : (
        <Collapse
          ghost
          expandIconPosition="end"
          defaultActiveKey={['MEMORY.md']}
          style={{ border: 'none' }}
          items={files.map((file) => ({
            key: file.filename,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{file.name}</Text>
                <Text style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {file.filename}
                  {file.updatedAt && ` · ${new Date(file.updatedAt).toLocaleDateString()}`}
                </Text>
              </div>
            ),
            children: (
              <div style={{ padding: '8px 12px' }}>
                {file.content ? (
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{file.content}</ReactMarkdown>
                  </div>
                ) : (
                  <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('memory.emptyFile')}</Text>
                )}
              </div>
            ),
          }))}
        />
      )}
    </div>
  );
};

export default MemoryPage;