import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  FolderPlus,
  FileText,
  ChevronRight,
  Plus,
  Search,
  Share2,
  Eye,
  Download,
  Trash2,
  MoreVertical,
  Edit3,
  ArrowLeft,
  Lock,
  Upload,
  X,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { vaultService, VaultFolder, VaultDocument } from '@/services/vaultService';

interface VaultFolderBrowserProps {
  folders: VaultFolder[];
  documents: VaultDocument[];
  currentFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onRefresh: () => void;
  onUploadClick: (folderId?: string) => void;
  onPreviewDocument: (docId: string) => void;
  onShareDocument: (doc: VaultDocument) => void;
  onShareFolder: (folder: VaultFolder) => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const FILE_TYPE_ICONS: Record<string, string> = {
  'application/pdf': '📄',
  'image/jpeg': '🖼️',
  'image/png': '🖼️',
  'image/webp': '🖼️',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
};

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
  const [showNewFolderForm, setShowNewFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderCategory, setNewFolderCategory] = useState('Other');
  const [isCreating, setIsCreating] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [contextMenuDocId, setContextMenuDocId] = useState<string | null>(null);

  // Current folder object
  const currentFolder = useMemo(
    () => folders.find((f) => f.id === currentFolderId) || null,
    [folders, currentFolderId],
  );

  // Breadcrumb path
  const breadcrumbs = useMemo(() => {
    const path: VaultFolder[] = [];
    let curr = currentFolder;
    while (curr) {
      path.unshift(curr);
      curr = folders.find((f) => f.id === curr?.parentId) || null;
    }
    return path;
  }, [currentFolder, folders]);

  // Subfolders of current folder (deduplicated by name to guarantee clean UI)
  const subfolders = useMemo(() => {
    const raw = folders.filter((f) =>
      currentFolderId ? f.parentId === currentFolderId : !f.parentId,
    );
    const deduped = new Map<string, VaultFolder>();
    for (const folder of raw) {
      const key = folder.name.trim().toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, folder);
      } else {
        const existing = deduped.get(key)!;
        if ((folder._count?.documents || 0) > (existing._count?.documents || 0)) {
          deduped.set(key, folder);
        }
      }
    }
    return Array.from(deduped.values());
  }, [folders, currentFolderId]);

  // Documents in current folder
  const folderDocuments = useMemo(() => {
    let docs = documents.filter((d) =>
      currentFolderId ? d.folderId === currentFolderId : !d.folderId,
    );

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      docs = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.originalFileName.toLowerCase().includes(q) ||
          (d.institution && d.institution.toLowerCase().includes(q)),
      );
    }

    // Deduplicate by ID
    return Array.from(new Map(docs.map(d => [d.id, d])).values());
  }, [documents, currentFolderId, searchQuery]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setIsCreating(true);
    try {
      await vaultService.createFolder({
        name: newFolderName.trim(),
        category: newFolderCategory,
        parentId: currentFolderId,
      });
      toast.success('Folder created');
      setNewFolderName('');
      setShowNewFolderForm(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create folder');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRenameFolder = async (folderId: string) => {
    if (!editFolderName.trim()) return;
    try {
      await vaultService.updateFolder(folderId, { name: editFolderName.trim() });
      toast.success('Folder renamed');
      setEditingFolderId(null);
      setEditFolderName('');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to rename folder');
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await vaultService.deleteFolder(folderId);
      toast.success('Folder deleted');
      if (currentFolderId === folderId) onSelectFolder(null);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete folder');
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      await vaultService.deleteDocument(docId);
      toast.success('Document deleted');
      setContextMenuDocId(null);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete document');
    }
  };

  return (
    <div className="space-y-4">
      {/* Breadcrumbs & Actions Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3 flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <button
            type="button"
            onClick={() => onSelectFolder(null)}
            className={`text-body-sm font-semibold transition-colors px-1.5 py-0.5 rounded ${
              !currentFolderId ? 'text-slate-900' : 'text-blue-600 hover:text-blue-700'
            }`}
          >
            Vault
          </button>
          {breadcrumbs.map((bc) => (
            <React.Fragment key={bc.id}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <button
                type="button"
                onClick={() => onSelectFolder(bc.id)}
                className={`text-body-sm font-semibold truncate max-w-[120px] transition-colors px-1.5 py-0.5 rounded ${
                  bc.id === currentFolderId ? 'text-slate-900' : 'text-blue-600 hover:text-blue-700'
                }`}
              >
                {bc.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowNewFolderForm(!showNewFolderForm)}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
            title="New Folder"
          >
            <FolderPlus className="w-4.5 h-4.5" />
          </button>
          <button
            type="button"
            onClick={() => onUploadClick(currentFolderId || undefined)}
            className="p-2 rounded-xl hover:bg-blue-50 text-blue-600 transition-colors"
            title="Upload Document"
          >
            <Upload className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* New Folder Form */}
      <AnimatePresence>
        {showNewFolderForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col gap-3">
              <h4 className="text-sm font-bold text-slate-900">Create New Folder</h4>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 font-medium transition-all outline-none"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
              <div className="relative">
                <select
                  value={newFolderCategory}
                  onChange={(e) => setNewFolderCategory(e.target.value)}
                  className="w-full h-11 px-3.5 pr-9 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs sm:text-sm text-slate-800 font-medium transition-all outline-none appearance-none cursor-pointer"
                >
                  <option value="Personal Documents">Personal Documents</option>
                  <option value="Property Documents">Property Documents</option>
                  <option value="Insurance">Insurance</option>
                  <option value="Financial Documents">Financial Documents</option>
                  <option value="Legal Documents">Legal Documents</option>
                  <option value="Medical Documents">Medical Documents</option>
                  <option value="Other">Other</option>
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowNewFolderForm(false)}
                  className="h-9 px-3.5 rounded-xl text-xs sm:text-sm font-semibold bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  disabled={isCreating || !newFolderName.trim()}
                  className="h-9 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm shadow-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search documents..."
          className="w-full h-11 pl-10 pr-9 rounded-xl border border-slate-200 bg-white shadow-2xs text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 font-medium focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-200 text-slate-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Subfolders Grid */}
      {subfolders.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">FOLDERS</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {subfolders.map((folder) => (
              <div
                key={folder.id}
                className="bg-white rounded-2xl border border-slate-200/80 hover:border-blue-300 hover:shadow-md transition-all duration-200 p-3 sm:p-3.5 group relative flex flex-col justify-between"
              >
                {editingFolderId === folder.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editFolderName}
                      onChange={(e) => setEditFolderName(e.target.value)}
                      className="w-full h-8 px-2.5 rounded-lg border border-blue-400 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400/20"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameFolder(folder.id);
                        if (e.key === 'Escape') setEditingFolderId(null);
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectFolder(folder.id)}
                    className="flex items-start gap-2.5 text-left w-full cursor-pointer"
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        backgroundColor: `${folder.color || '#7C3AED'}15`,
                        color: folder.color || '#7C3AED',
                      }}
                    >
                      <Folder className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-semibold text-slate-800 leading-snug line-clamp-2 break-words">
                        {folder.name}
                      </p>
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                        {folder._count?.documents || 0} docs
                        {folder._count?.subfolders ? ` · ${folder._count.subfolders} folders` : ''}
                      </p>
                    </div>
                  </button>
                )}

                {/* Folder actions */}
                {!folder.isDefault && editingFolderId !== folder.id && (
                  <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShareFolder(folder);
                      }}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                      title="Share"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFolderId(folder.id);
                        setEditFolderName(folder.name);
                      }}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                      title="Rename"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFolder(folder.id);
                      }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents List */}
      {folderDocuments.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">DOCUMENTS</h3>
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-0 divide-y divide-slate-100 overflow-hidden">
            {folderDocuments.map((doc) => (
              <div
                key={doc.id}
                className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors relative group"
              >
                <button
                  type="button"
                  onClick={() => onPreviewDocument(doc.id)}
                  className="flex items-center gap-3 min-w-0 text-left flex-1"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 text-lg">
                    {FILE_TYPE_ICONS[doc.fileType] || '📄'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-card-title truncate">{doc.title}</p>
                      {doc.isSensitive && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
                    </div>
                    <p className="text-caption">
                      {doc.category} · {formatBytes(doc.fileSize)} · v{doc.currentVersion}
                    </p>
                  </div>
                </button>

                {/* Document Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => onPreviewDocument(doc.id)}
                    className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-colors"
                    title="Preview"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => vaultService.downloadDocument(doc.id, doc.originalFileName)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onShareDocument(doc)}
                    className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-colors"
                    title="Share"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteDocument(doc.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty Folder State */}
      {subfolders.length === 0 && folderDocuments.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col items-center text-center py-12 px-4">
          <Folder className="w-10 h-10 text-slate-300 mb-2" />
          <h4 className="text-card-title text-slate-700">
            {currentFolderId ? 'This folder is empty' : 'No documents yet'}
          </h4>
          <p className="text-body-sm text-slate-400 mt-1">
            {currentFolderId
              ? 'Upload documents or create subfolders to organize your files.'
              : 'Start by selecting a category from the Overview or upload a document.'}
          </p>
          <button
            type="button"
            onClick={() => onUploadClick(currentFolderId || undefined)}
            className="h-10 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm shadow-blue-500/20 transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer mt-3"
          >
            <Plus className="w-4 h-4" />
            Upload Document
          </button>
        </div>
      )}
    </div>
  );
};
