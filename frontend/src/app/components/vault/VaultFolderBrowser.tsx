import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  FolderPlus,
  FolderOpen,
  ChevronRight,
  MoreVertical,
  Edit2,
  Trash2,
  Share2,
  FileText,
  Lock,
  Search,
  Plus,
  ArrowUpDown,
  Download,
  Eye,
  Tag,
  ShieldCheck,
  Building2,
  Calendar,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { VaultFolder, VaultDocument, vaultService } from '@/services/vaultService';

interface VaultFolderBrowserProps {
  folders: VaultFolder[];
  documents: VaultDocument[];
  currentFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onRefresh: () => void;
  onUploadClick: (folderId?: string | null) => void;
  onPreviewDocument: (docId: string) => void;
  onShareDocument: (doc: VaultDocument) => void;
  onShareFolder: (folder: VaultFolder) => void;
}

export const VaultFolderBrowser: React.FC<VaultFolderBrowserProps> = ({
  folders,
  documents,
  currentFolderId,
  onSelectFolder,
  onRefresh,
  onUploadClick,
  onPreviewDocument,
  onShareDocument,
  onShareFolder,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'size'>('date');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<VaultFolder | null>(null);
  const [editFolderName, setEditFolderName] = useState('');

  // Active folder object
  const currentFolder = folders.find((f) => f.id === currentFolderId) || null;

  // Compute breadcrumbs
  const breadcrumbs: { id: string | null; name: string }[] = [{ id: null, name: 'Vault Root' }];
  if (currentFolder) {
    if (currentFolder.parentId) {
      const parent = folders.find((f) => f.id === currentFolder.parentId);
      if (parent) breadcrumbs.push({ id: parent.id, name: parent.name });
    }
    breadcrumbs.push({ id: currentFolder.id, name: currentFolder.name });
  }

  // Subfolders in this current view
  const visibleSubfolders = folders.filter((f) => {
    if (currentFolderId === null) {
      // Top level: folders without parentId
      return !f.parentId;
    }
    return f.parentId === currentFolderId;
  });

  // Documents in this current folder
  const currentDocs = documents.filter((d) => {
    if (currentFolderId === null) {
      // Root level documents
      return !d.folderId;
    }
    return d.folderId === currentFolderId;
  });

  // Filter & Search
  const filteredDocs = currentDocs
    .filter((d) => {
      if (selectedTag !== 'ALL' && !d.tags?.includes(selectedTag)) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        d.title.toLowerCase().includes(q) ||
        d.institution?.toLowerCase().includes(q) ||
        d.documentNumber?.toLowerCase().includes(q) ||
        d.originalFileName.toLowerCase().includes(q) ||
        d.tags?.some((t) => t.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'size') return b.fileSize - a.fileSize;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // Available tags in current folder
  const availableTags = Array.from(new Set(currentDocs.flatMap((d) => d.tags || [])));

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await vaultService.createFolder({
        name: newFolderName.trim(),
        parentId: currentFolderId,
        category: currentFolder?.category || 'Other',
      });
      toast.success(`Created folder "${newFolderName.trim()}"`);
      setNewFolderName('');
      setIsCreatingFolder(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create folder');
    }
  };

  const handleUpdateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder || !editFolderName.trim()) return;
    try {
      await vaultService.updateFolder(editingFolder.id, { name: editFolderName.trim() });
      toast.success('Folder renamed');
      setEditingFolder(null);
      onRefresh();
    } catch {
      toast.error('Failed to rename folder');
    }
  };

  const handleDeleteFolder = async (folder: VaultFolder) => {
    if (!window.confirm(`Delete folder "${folder.name}"? Documents will be moved to root.`)) return;
    try {
      await vaultService.deleteFolder(folder.id);
      toast.success('Folder deleted');
      if (currentFolderId === folder.id) {
        onSelectFolder(folder.parentId || null);
      }
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to delete folder');
    }
  };

  const handleDeleteDoc = async (doc: VaultDocument) => {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    try {
      await vaultService.deleteDocument(doc.id);
      toast.success('Document deleted');
      onRefresh();
    } catch {
      toast.error('Failed to delete document');
    }
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumb Navigation & Top Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto max-w-full text-xs font-semibold py-1">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id || 'root'}>
              {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
              <button
                type="button"
                onClick={() => onSelectFolder(crumb.id)}
                className={`truncate max-w-[150px] transition-colors ${
                  idx === breadcrumbs.length - 1
                    ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {currentFolder && (
            <button
              type="button"
              onClick={() => onShareFolder(currentFolder)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>Share Folder</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCreatingFolder(true)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5 text-indigo-500" />
            <span>New Folder</span>
          </button>
          <button
            type="button"
            onClick={() => onUploadClick(currentFolderId)}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* New Folder Modal */}
      <AnimatePresence>
        {isCreatingFolder && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-800/60 shadow-md"
          >
            <form onSubmit={handleCreateFolder} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={currentFolderId ? 'Subfolder name (e.g. Father, Mother, Taxes)' : 'Folder name'}
                autoFocus
                className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rename Folder Dialog */}
      <AnimatePresence>
        {editingFolder && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-800/60 shadow-md"
          >
            <form onSubmit={handleUpdateFolder} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={editFolderName}
                onChange={(e) => setEditFolderName(e.target.value)}
                autoFocus
                className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingFolder(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subfolders Grid */}
      {visibleSubfolders.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            {currentFolderId ? 'Subfolders' : 'Categories & Folders'} ({visibleSubfolders.length})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {visibleSubfolders.map((folder) => (
              <div
                key={folder.id}
                className="group relative p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-300 dark:hover:border-indigo-800/60 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                onClick={() => onSelectFolder(folder.id)}
              >
                <div className="flex items-start justify-between">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
                    style={{ backgroundColor: `${folder.color || '#6366F1'}1A`, color: folder.color || '#6366F1' }}
                  >
                    <Folder className="w-5 h-5" />
                  </div>

                  {/* Actions Dropdown / buttons */}
                  {!folder.isDefault && (
                    <div
                      className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFolder(folder);
                          setEditFolderName(folder.name);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600"
                        title="Rename"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFolder(folder)}
                        className="p-1 text-slate-400 hover:text-red-500"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate" title={folder.name}>
                    {folder.name}
                  </h5>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {folder._count?.documents || 0} documents
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents Header with Search, Tag Filter, and Sort */}
      <div className="pt-2">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Documents ({filteredDocs.length})
          </h4>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Search */}
            <div className="relative flex-1 md:w-56">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
            >
              <option value="date">Sort: Date</option>
              <option value="title">Sort: Title</option>
              <option value="size">Sort: Size</option>
            </select>
          </div>
        </div>

        {/* Tag Pills */}
        {availableTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <button
              type="button"
              onClick={() => setSelectedTag('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedTag === 'ALL'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
              }`}
            >
              All Tags
            </button>
            {availableTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTag(t)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  selectedTag === t
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                }`}
              >
                #{t}
              </button>
            ))}
          </div>
        )}

        {/* Document Cards List */}
        {filteredDocs.length === 0 ? (
          <div className="py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center mx-auto mb-2">
              <FileText className="w-6 h-6" />
            </div>
            <h5 className="text-sm font-bold text-slate-800 dark:text-white">No documents in this folder</h5>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Upload your personal identity, property, insurance or financial documents.
            </p>
            <button
              type="button"
              onClick={() => onUploadClick(currentFolderId)}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-sm"
            >
              + Upload Document
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                onClick={() => onPreviewDocument(doc.id)}
                className="group p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800/60 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center font-bold text-[10px] uppercase flex-shrink-0">
                        {doc.originalFileName.split('.').pop() || 'DOC'}
                      </div>
                      <div className="min-w-0">
                        <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate" title={doc.title}>
                          {doc.title}
                        </h5>
                        <p className="text-[10px] text-slate-400 truncate">{doc.category}</p>
                      </div>
                    </div>

                    {doc.isSensitive && (
                      <span className="p-1 rounded-md bg-amber-100 dark:bg-amber-950/50 text-amber-600" title="Sensitive Document">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  {doc.institution && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-1">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      <span className="truncate">{doc.institution}</span>
                    </div>
                  )}

                  {doc.expiryDate && (
                    <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 mb-1">
                      <Calendar className="w-3 h-3" />
                      <span>Expires: {new Date(doc.expiryDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>v{doc.currentVersion} • {(doc.fileSize / 1024).toFixed(0)} KB</span>

                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onShareDocument(doc)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 transition-colors"
                      title="Share Document"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => vaultService.downloadDocument(doc.id, doc.originalFileName)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 transition-colors"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDoc(doc)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
