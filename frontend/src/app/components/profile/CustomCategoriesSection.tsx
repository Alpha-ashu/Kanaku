import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Tag, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AppCategory } from '@/lib/database';
import {
  createCategoryEverywhere,
  deleteCategoryEverywhere,
  syncCategories,
  updateCategoryEverywhere,
} from '@/services/featureSyncService';
import { useCategoryOptions, type CategoryType } from '@/hooks/useCategoryOptions';
import { cn } from '@/lib/utils';

/** Swatches offered when creating a category — enough choice without a picker. */
const COLOR_CHOICES = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981',
  '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6',
  '#EC4899', '#6B7280',
];

const ICON_CHOICES = [
  'tag', 'shopping-cart', 'utensils', 'car', 'home', 'heart',
  'plane', 'gift', 'book', 'briefcase', 'zap', 'wallet',
];

interface DraftState {
  name: string;
  color: string;
  icon: string;
}

const emptyDraft = (): DraftState => ({ name: '', color: COLOR_CHOICES[0], icon: ICON_CHOICES[0] });

/**
 * Manage the user's own categories.
 *
 * `db.categories` was previously written to only by the import pipeline and read
 * by nothing the user could reach — categories an import created were invisible
 * and unmanageable. This is the surface for them: rename, restyle, remove, and
 * add new ones. Everything here goes through the *Everywhere helpers so the
 * change reaches the backend too, rather than living on one device.
 */
export const CustomCategoriesSection: React.FC = () => {
  const [activeType, setActiveType] = useState<CategoryType>('expense');
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftState>(emptyDraft);
  const [busy, setBusy] = useState(false);

  const options = useCategoryOptions(activeType);

  const importedCount = useLiveQuery(
    () => db.categories.filter((row) => !row.deletedAt && row.createdFromImport === true).count(),
    [],
    0,
  );

  const customOptions = useMemo(() => options.filter((option) => option.isCustom), [options]);
  const builtinOptions = useMemo(() => options.filter((option) => !option.isCustom), [options]);

  const handleCreate = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast.error('Give the category a name');
      return;
    }
    if (options.some((option) => option.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`A ${activeType} category called "${name}" already exists`);
      return;
    }

    setBusy(true);
    try {
      await createCategoryEverywhere({ name, type: activeType, color: draft.color, icon: draft.icon });
      toast.success(`Added "${name}"`);
      setDraft(emptyDraft());
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create category:', error);
      toast.error('Failed to add category');
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = (record: AppCategory) => {
    setEditingId(record.id);
    setEditDraft({ name: record.name, color: record.color, icon: record.icon });
  };

  const handleSaveEdit = async (record: AppCategory) => {
    const name = editDraft.name.trim();
    if (!name) {
      toast.error('Give the category a name');
      return;
    }
    const clash = options.some(
      (option) => option.name.toLowerCase() === name.toLowerCase() && option.record?.id !== record.id,
    );
    if (clash) {
      toast.error(`A ${activeType} category called "${name}" already exists`);
      return;
    }

    setBusy(true);
    try {
      await updateCategoryEverywhere(record, { name, color: editDraft.color, icon: editDraft.icon });
      toast.success('Category updated');
      setEditingId(null);
    } catch (error) {
      console.error('Failed to update category:', error);
      toast.error('Failed to update category');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (record: AppCategory) => {
    // Transactions store the category NAME, so removing a category never edits
    // history — say so plainly rather than letting the user fear data loss.
    if (!confirm(`Remove "${record.name}"? Existing transactions keep this label; it just stops appearing in pickers.`)) {
      return;
    }
    setBusy(true);
    try {
      await deleteCategoryEverywhere(record);
      toast.success(`Removed "${record.name}"`);
    } catch (error) {
      console.error('Failed to delete category:', error);
      toast.error('Failed to remove category');
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    try {
      const result = await syncCategories();
      if (result.offline) {
        toast.error('Could not reach the server');
      } else {
        toast.success(`Synced — ${result.pulled} pulled, ${result.pushed} pushed`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-gray-50 rounded-3xl overflow-hidden" data-testid="custom-categories-section">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center">
              <Tag className="text-indigo-600" size={20} />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Categories</h4>
              <p className="text-sm text-gray-500">
                Your own categories appear everywhere you pick one.
                {importedCount > 0 && ` ${importedCount} came from an import.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={busy}
            className="px-3 py-1.5 text-sm font-medium rounded-full border border-gray-300 hover:bg-white transition-all active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
            data-testid="categories-sync-button"
          >
            <Download size={14} /> Sync
          </button>
        </div>

        <div className="mt-4 inline-flex rounded-full bg-white border border-gray-200 p-1">
          {(['expense', 'income'] as CategoryType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => { setActiveType(type); setEditingId(null); setIsCreating(false); }}
              className={cn(
                'px-4 py-1.5 text-sm font-medium rounded-full transition-all capitalize',
                activeType === type ? 'bg-black text-white' : 'text-gray-600 hover:text-gray-900',
              )}
              data-testid={`categories-tab-${type}`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Create */}
        {isCreating ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <input
              autoFocus
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={`New ${activeType} category`}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black"
              data-testid="category-name-input"
            />
            <div className="flex flex-wrap gap-2">
              {COLOR_CHOICES.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Colour ${color}`}
                  onClick={() => setDraft((prev) => ({ ...prev, color }))}
                  className={cn(
                    'w-7 h-7 rounded-full transition-transform',
                    draft.color === color ? 'ring-2 ring-offset-2 ring-black scale-110' : 'hover:scale-105',
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <select
              value={draft.icon}
              onChange={(event) => setDraft((prev) => ({ ...prev, icon: event.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
              data-testid="category-icon-select"
            >
              {ICON_CHOICES.map((icon) => (
                <option key={icon} value={icon}>{icon}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={busy}
                className="px-4 py-2 rounded-full bg-black text-white text-sm font-medium disabled:opacity-50"
                data-testid="category-save-button"
              >
                Add category
              </button>
              <button
                type="button"
                onClick={() => { setIsCreating(false); setDraft(emptyDraft()); }}
                className="px-4 py-2 rounded-full border border-gray-300 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-900 transition-all active:scale-95"
            data-testid="category-add-button"
          >
            <Plus size={16} /> New {activeType} category
          </button>
        )}

        {/* Custom categories */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Your categories ({customOptions.length})
          </p>
          {customOptions.length === 0 ? (
            <p className="text-sm text-gray-500">
              None yet. Add one above, or import a file — unrecognised categories are created for you.
            </p>
          ) : (
            customOptions.map((option) => {
              const record = option.record!;
              const isEditing = editingId === record.id;
              return (
                <div
                  key={record.id}
                  className="bg-white rounded-2xl border border-gray-200 p-3 flex items-center gap-3"
                >
                  {isEditing ? (
                    <>
                      <input
                        value={editDraft.name}
                        onChange={(event) => setEditDraft((prev) => ({ ...prev, name: event.target.value }))}
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black"
                        data-testid="category-edit-input"
                      />
                      <div className="flex gap-1">
                        {COLOR_CHOICES.slice(0, 6).map((color) => (
                          <button
                            key={color}
                            type="button"
                            aria-label={`Colour ${color}`}
                            onClick={() => setEditDraft((prev) => ({ ...prev, color }))}
                            className={cn(
                              'w-5 h-5 rounded-full',
                              editDraft.color === color && 'ring-2 ring-offset-1 ring-black',
                            )}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(record)}
                        disabled={busy}
                        className="p-2 rounded-full hover:bg-gray-100 text-green-600 disabled:opacity-50"
                        aria-label="Save"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                        aria-label="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        className="w-8 h-8 rounded-xl shrink-0"
                        style={{ backgroundColor: option.color || '#6B7280' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{option.name}</p>
                        {record.createdFromImport && (
                          <p className="text-xs text-gray-500">Created by an import</p>
                        )}
                      </div>
                      {!record.cloudId && (
                        <span className="text-xs text-amber-600 shrink-0">Not synced</span>
                      )}
                      <button
                        type="button"
                        onClick={() => beginEdit(record)}
                        className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
                        aria-label={`Edit ${option.name}`}
                        data-testid="category-edit-button"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(record)}
                        disabled={busy}
                        className="p-2 rounded-full hover:bg-red-50 text-red-600 disabled:opacity-50"
                        aria-label={`Remove ${option.name}`}
                        data-testid="category-delete-button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Built-ins, for reference */}
        <details className="pt-2">
          <summary className="text-xs font-semibold uppercase tracking-wide text-gray-500 cursor-pointer">
            Built-in categories ({builtinOptions.length})
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {builtinOptions.map((option) => (
              <span
                key={option.name}
                className="px-3 py-1 rounded-full bg-white border border-gray-200 text-sm text-gray-700"
              >
                {option.name}
              </span>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
};
