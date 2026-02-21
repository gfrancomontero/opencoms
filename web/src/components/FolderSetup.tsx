import React, { useState } from 'react';
import { selectFolder } from '../api';

interface Props {
  onFolderSelected: (folder: string) => void;
}

export default function FolderSetup({ onFolderSelected }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChooseFolder = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await selectFolder(true);
      if (result.success && result.folder) {
        onFolderSelected(result.folder);
      } else {
        setError(result.message || 'No folder selected');
      }
    } catch (err: any) {
      setError('Failed to open folder picker. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h2>Choose Your Documents Folder</h2>
        <p className="subtitle">
          Select the folder containing the documents you'd like to search and chat about.
          OpenComs will scan it for PDFs, Word docs, and spreadsheets.
        </p>

        <button
          className="btn btn-primary"
          onClick={handleChooseFolder}
          disabled={loading}
          style={{ padding: '14px 32px', fontSize: '16px' }}
        >
          {loading ? 'Opening folder picker...' : 'Choose Folder'}
        </button>

        {error && (
          <p style={{ color: 'var(--red)', marginTop: 16, fontSize: 14 }}>
            {error}
          </p>
        )}

        <p style={{ marginTop: 24, fontSize: 13, color: 'var(--text-secondary)' }}>
          Supported files: PDF, DOC, DOCX, XLS, XLSX
        </p>
      </div>
    </div>
  );
}
