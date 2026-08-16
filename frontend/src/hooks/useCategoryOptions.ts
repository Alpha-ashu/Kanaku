import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AppCategory } from '@/lib/database';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/expenseCategories';

export type CategoryType = 'expense' | 'income';

export interface CategoryOption {
  name: string;
  type: CategoryType;
  color?: string;
  icon?: string;
  /** False for the app's built-in seeds, true for anything the user owns. */
  isCustom: boolean;
  /** Only set for custom categories — built-ins have no Dexie row. */
  record?: AppCategory;
}

const builtinNames = (type: CategoryType): string[] =>
  Object.values((type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES) as Record<string, { name: string }>)
    .map((entry) => entry.name);

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * The single source of truth for "what categories can this record use".
 *
 * Every picker previously built its own list straight from the built-in
 * constants, so a category the user created — or one the importer created to
 * hold an incoming file's labels — existed in `db.categories` but never appeared
 * anywhere the user could pick it. Reading through this hook means a category
 * added anywhere shows up immediately in every picker, because `useLiveQuery`
 * re-renders on the Dexie write.
 *
 * Built-ins come first and keep their familiar order; custom categories follow,
 * alphabetically. A custom row whose name matches a built-in is treated as the
 * same category (the user restyling a built-in), not a second entry.
 */
export const useCategoryOptions = (type: CategoryType): CategoryOption[] => {
  const customRows = useLiveQuery(
    () => db.categories.filter((row) => !row.deletedAt && row.type === type).toArray(),
    [type],
    [] as AppCategory[],
  );

  return useMemo(() => {
    const builtins = builtinNames(type);
    const builtinSet = new Set(builtins.map(normalize));

    const customByName = new Map<string, AppCategory>();
    for (const row of customRows ?? []) {
      const key = normalize(row.name);
      if (key) customByName.set(key, row);
    }

    const options: CategoryOption[] = builtins.map((name) => {
      const override = customByName.get(normalize(name));
      return {
        name,
        type,
        color: override?.color,
        icon: override?.icon,
        isCustom: false,
        record: override,
      };
    });

    const extras = (customRows ?? [])
      .filter((row) => row.name.trim() && !builtinSet.has(normalize(row.name)))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((row) => ({
        name: row.name,
        type,
        color: row.color,
        icon: row.icon,
        isCustom: true,
        record: row,
      }));

    return [...options, ...extras];
  }, [customRows, type]);
};

/** Convenience for the many pickers that only want names. */
export const useCategoryNames = (type: CategoryType): string[] => {
  const options = useCategoryOptions(type);
  return useMemo(() => options.map((option) => option.name), [options]);
};
