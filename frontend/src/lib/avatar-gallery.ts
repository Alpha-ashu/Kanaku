export type AvatarGender = 'male' | 'female' | 'neutral';
export type AvatarStyle = 'casual' | 'professional' | 'sport';
export type AvatarSkinTone = 'light' | 'tan' | 'brown' | 'dark';

export type AvatarOption = {
  id: string;
  url: string;
  gender: AvatarGender;
  style: AvatarStyle;
  skinTone: AvatarSkinTone;
  label: string;
};

const titleize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

// Exactly 28 high-quality, new character avatars using diverse DiceBear styles
const CURATED_AVATARS: AvatarOption[] = [
  // 1-10: Avataaars (Diverse Human Styles)
  { id: 'new-1', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Xavier', gender: 'male', style: 'casual', skinTone: 'tan', label: 'Xavier' },
  { id: 'new-2', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Seraphina', gender: 'female', style: 'professional', skinTone: 'light', label: 'Seraphina' },
  { id: 'new-3', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kael', gender: 'male', style: 'sport', skinTone: 'brown', label: 'Kael' },
  { id: 'new-4', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Imani', gender: 'female', style: 'casual', skinTone: 'dark', label: 'Imani' },
  { id: 'new-5', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Soren', gender: 'male', style: 'sport', skinTone: 'light', label: 'Soren' },
  { id: 'new-6', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lyra', gender: 'female', style: 'casual', skinTone: 'tan', label: 'Lyra' },
  { id: 'new-7', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Atticus', gender: 'male', style: 'professional', skinTone: 'brown', label: 'Atticus' },
  { id: 'new-8', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Freya', gender: 'female', style: 'sport', skinTone: 'light', label: 'Freya' },
  { id: 'new-9', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Zion', gender: 'male', style: 'casual', skinTone: 'dark', label: 'Zion' },
  { id: 'new-10', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Amara', gender: 'female', style: 'professional', skinTone: 'brown', label: 'Amara' },

  // 11-16: Micah (Modern Minimalist)
  { id: 'new-11', url: 'https://api.dicebear.com/7.x/micah/svg?seed=Atlas', gender: 'male', style: 'casual', skinTone: 'tan', label: 'Atlas' },
  { id: 'new-12', url: 'https://api.dicebear.com/7.x/micah/svg?seed=Nova', gender: 'female', style: 'sport', skinTone: 'light', label: 'Nova' },
  { id: 'new-13', url: 'https://api.dicebear.com/7.x/micah/svg?seed=Orion', gender: 'male', style: 'professional', skinTone: 'brown', label: 'Orion' },
  { id: 'new-14', url: 'https://api.dicebear.com/7.x/micah/svg?seed=Veda', gender: 'female', style: 'casual', skinTone: 'dark', label: 'Veda' },
  { id: 'new-15', url: 'https://api.dicebear.com/7.x/micah/svg?seed=Cyrus', gender: 'male', style: 'sport', skinTone: 'light', label: 'Cyrus' },
  { id: 'new-16', url: 'https://api.dicebear.com/7.x/micah/svg?seed=Elara', gender: 'female', style: 'professional', skinTone: 'tan', label: 'Elara' },

  // 17-20: Lorelei (Hand-drawn Artistic)
  { id: 'new-17', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Indigo', gender: 'neutral', style: 'casual', skinTone: 'tan', label: 'Indigo' },
  { id: 'new-18', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Sage', gender: 'female', style: 'sport', skinTone: 'light', label: 'Sage' },
  { id: 'new-19', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=River', gender: 'male', style: 'professional', skinTone: 'brown', label: 'River' },
  { id: 'new-20', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Willow', gender: 'female', style: 'casual', skinTone: 'dark', label: 'Willow' },

  // 21-24: Big Smile (Friendly Faces)
  { id: 'new-21', url: 'https://api.dicebear.com/7.x/big-smile/svg?seed=Bowie', gender: 'male', style: 'casual', skinTone: 'tan', label: 'Bowie' },
  { id: 'new-22', url: 'https://api.dicebear.com/7.x/big-smile/svg?seed=Cleo', gender: 'female', style: 'sport', skinTone: 'light', label: 'Cleo' },
  { id: 'new-23', url: 'https://api.dicebear.com/7.x/big-smile/svg?seed=Dante', gender: 'male', style: 'professional', skinTone: 'brown', label: 'Dante' },
  { id: 'new-24', url: 'https://api.dicebear.com/7.x/big-smile/svg?seed=Ember', gender: 'female', style: 'casual', skinTone: 'dark', label: 'Ember' },

  // 25-28: Bottts (Fun Tech Avatars)
  { id: 'new-25', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Z-44', gender: 'neutral', style: 'casual', skinTone: 'tan', label: 'Z-44' },
  { id: 'new-26', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=R-90', gender: 'neutral', style: 'sport', skinTone: 'tan', label: 'R-90' },
  { id: 'new-27', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=T-10', gender: 'neutral', style: 'professional', skinTone: 'tan', label: 'T-10' },
  { id: 'new-28', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=M-22', gender: 'neutral', style: 'casual', skinTone: 'tan', label: 'M-22' },
];

const decodeName = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const getFilename = (value: string) => {
  const parts = value.split('?')[0].split('/');
  return decodeName(parts[parts.length - 1] || '');
};

const getSeed = (value: string) => {
  try {
    const url = new URL(value);
    return url.searchParams.get('seed');
  } catch {
    return null;
  }
};

const buildOptions = (): AvatarOption[] => {
  const options = [...CURATED_AVATARS];

  try {
    const localAvatarModules = import.meta.glob<string>('../assets/avatars/*.png', {
      eager: true,
      import: 'default',
    });

    const localOptions: AvatarOption[] = Object.entries(localAvatarModules).map(([filePath, url]) => {
      const filename = filePath.split('/').pop()?.replace('.png', '') || 'avatar';
      
      const label = filename
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      let gender: AvatarGender = 'neutral';
      if (filename.toLowerCase().includes('user')) {
        gender = 'neutral';
      }

      return {
        id: `local-${filename.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        url,
        gender,
        style: 'casual' as AvatarStyle,
        skinTone: 'tan' as AvatarSkinTone,
        label,
      };
    });

    localOptions.sort((a, b) => {
      return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
    });

    options.push(...localOptions);
  } catch (error) {
    console.error('Failed to load local avatars:', error);
  }

  return options;
};

const FALLBACK_AVATAR: AvatarOption = {
  id: 'avatar-default',
  url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
  gender: 'neutral',
  style: 'casual',
  skinTone: 'tan',
  label: 'Default Avatar',
};

export const AVATAR_OPTIONS: AvatarOption[] = buildOptions();

if (AVATAR_OPTIONS.length === 0) {
  AVATAR_OPTIONS.push(FALLBACK_AVATAR);
}

export const DEFAULT_AVATAR = AVATAR_OPTIONS[0];

const toPath = (value?: string | null): string | null => {
  if (!value) return null;
  if (value.startsWith('/')) return value.split('?')[0];
  if (value.startsWith('avatars/')) return `/${value}`.split('?')[0];
  try {
    const parsed = new URL(value);
    return parsed.pathname;
  } catch {
    return value;
  }
};

export const getAvatarById = (id?: string | null) =>
  AVATAR_OPTIONS.find((option) => option.id === id) || null;

export const getAvatarByUrl = (url?: string | null) => {
  if (!url) return null;
  
  // Try exact match
  const direct = AVATAR_OPTIONS.find((option) => option.url === url);
  if (direct) return direct;

  // Try matching by seed (for DiceBear 7.x)
  const seed = getSeed(url);
  if (seed) {
    const bySeed = AVATAR_OPTIONS.find((option) => getSeed(option.url) === seed);
    if (bySeed) return bySeed;
  }

  // Fallback to filename match
  const filename = getFilename(url);
  if (!filename) return null;
  return AVATAR_OPTIONS.find((option) => getFilename(option.url) === filename) || null;
};

export const resolveAvatarSelection = (args?: {
  avatarId?: string | null;
  avatarUrl?: string | null;
}) => {
  const byId = args?.avatarId ? getAvatarById(args.avatarId) : null;
  if (byId) return byId;
  const byUrl = getAvatarByUrl(args?.avatarUrl ?? null);
  if (byUrl) return byUrl;
  return DEFAULT_AVATAR;
};

export const normalizeAvatarUrl = (avatarUrl?: string | null) =>
  getAvatarByUrl(avatarUrl)?.url || DEFAULT_AVATAR.url;
