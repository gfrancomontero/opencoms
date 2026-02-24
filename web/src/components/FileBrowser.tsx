import React, { useState, useEffect } from 'react';
import { fetchFiles, openFile } from '../api';

interface FileRecord {
  file_path: string;
  file_type: string;
  status: string;
  error_message?: string;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isFolder: boolean;
  children: TreeNode[];
  file?: FileRecord;
}

function buildTree(files: FileRecord[], rootFolder: string): TreeNode[] {
  const root: TreeNode = { name: '', fullPath: rootFolder, isFolder: true, children: [] };

  for (const file of files) {
    // Get path relative to root folder
    let relative = file.file_path;
    if (relative.startsWith(rootFolder)) {
      relative = relative.slice(rootFolder.length);
      if (relative.startsWith('/')) relative = relative.slice(1);
    }

    const parts = relative.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          fullPath: isLast ? file.file_path : '',
          isFolder: !isLast,
          children: [],
          file: isLast ? file : undefined,
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  // Sort: folders first, then alphabetically
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes
      .sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((n) => ({ ...n, children: sortNodes(n.children) }));
  };

  return sortNodes(root.children);
}

function FileTreeNode({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);

  const statusDot = node.file
    ? node.file.status === 'indexed'
      ? 'green'
      : node.file.status === 'failed'
        ? 'red'
        : 'yellow'
    : null;

  const handleClick = () => {
    if (node.isFolder) {
      setExpanded(!expanded);
    } else if (node.file) {
      openFile(node.file.file_path);
    }
  };

  return (
    <div>
      <div
        className={`filebrowser-row ${node.isFolder ? 'folder' : 'file'}`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={handleClick}
      >
        <span className="filebrowser-icon">
          {node.isFolder ? (expanded ? '&#128194;' : '&#128193;') : '&#128196;'}
        </span>
        <span className="filebrowser-name">{node.name}</span>
        {statusDot && <span className={`status-dot ${statusDot}`} />}
        {node.file?.status === 'failed' && (
          <span className="filebrowser-error" title={node.file.error_message || 'Failed'}>
            &#9888;
          </span>
        )}
      </div>
      {node.isFolder && expanded && (
        <div>
          {node.children.map((child, i) => (
            <FileTreeNode key={i} node={child} depth={depth + 1} />
          ))}
          {node.children.length === 0 && (
            <div className="filebrowser-empty" style={{ paddingLeft: `${(depth + 1) * 20 + 12}px` }}>
              (empty)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  folder: string;
}

export default function FileBrowser({ folder }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [stats, setStats] = useState({ total: 0, indexed: 0, failed: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchFiles()
      .then((data) => {
        const files: FileRecord[] = data.files || [];
        setTree(buildTree(files, folder));
        setStats({
          total: files.length,
          indexed: files.filter((f) => f.status === 'indexed').length,
          failed: files.filter((f) => f.status === 'failed').length,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [folder]);

  if (loading) {
    return (
      <div className="filebrowser-loading">Loading files...</div>
    );
  }

  return (
    <div className="filebrowser">
      <div className="filebrowser-header">
        <div className="filebrowser-stats">
          <span><span className="status-dot green" /> {stats.indexed} indexed</span>
          {stats.failed > 0 && <span><span className="status-dot red" /> {stats.failed} failed</span>}
          <span style={{ color: 'var(--text-secondary)' }}>{stats.total} total</span>
        </div>
        <div className="filebrowser-folder-path">{folder}</div>
      </div>
      <div className="filebrowser-tree">
        {tree.map((node, i) => (
          <FileTreeNode key={i} node={node} depth={0} />
        ))}
      </div>
    </div>
  );
}
