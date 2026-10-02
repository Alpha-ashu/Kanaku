import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { backendService } from '@/lib/backend-api';
import { describeApiFailure } from '@/services/advisorApplicationService';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { cn } from '@/lib/utils';

const MAX_REVIEW_LENGTH = 1000;
const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

interface SessionRatingProps {
  sessionId: string;
  rating?: number | null;
  feedback?: string | null;
  onRated: (rating: number, feedback: string | null) => void;
}

/**
 * The client's rating of a completed consultation: 1–5 stars and an optional
 * written review. Sessions told the client "please rate your experience" but
 * there was nowhere to do it, so every advisor showed no ratings.
 */
export const SessionRating: React.FC<SessionRatingProps> = ({ sessionId, rating, feedback, onRated }) => {
  const guardSubmit = useSubmitLock();
  const [editing, setEditing] = useState(!rating);
  const [stars, setStars] = useState<number>(rating ?? 0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState(feedback ?? '');
  const [saving, setSaving] = useState(false);

  const submit = guardSubmit(async () => {
    if (stars < 1) {
      toast.error('Choose a rating from 1 to 5 stars.');
      return;
    }
    setSaving(true);
    try {
      const review = text.trim().slice(0, MAX_REVIEW_LENGTH);
      await backendService.api.post(`/bookings/sessions/${encodeURIComponent(sessionId)}/review`, { rating: stars, feedback: review });
      onRated(stars, review || null);
      setEditing(false);
      toast.success(rating ? 'Your rating was updated.' : 'Thanks — your rating was sent to the advisor.');
    } catch (error) {
      toast.error((await describeApiFailure(error, 'Could not save your rating.')).message);
    } finally {
      setSaving(false);
    }
  });

  if (!editing && rating) {
    return (
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-violet-50/70 border border-violet-200/70 rounded-2xl" data-testid={`session-rating-${sessionId}`}>
        <div className="min-w-0">
          <p className="text-2xs font-black uppercase tracking-wider text-violet-700">Your rating</p>
          <div className="flex items-center gap-0.5 mt-0.5" aria-label={`${rating} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={13} className={n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
            ))}
          </div>
          {feedback && <p className="text-xs text-slate-600 mt-1 line-clamp-2">{feedback}</p>}
        </div>
        <button
          type="button"
          onClick={() => { setStars(rating); setText(feedback ?? ''); setEditing(true); }}
          className="shrink-0 px-3 py-1 rounded-full text-2xs font-bold text-violet-700 bg-white border border-violet-200 hover:bg-violet-50 cursor-pointer"
        >
          Edit
        </button>
      </div>
    );
  }

  const shown = hover || stars;
  return (
    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2" data-testid={`session-rating-form-${sessionId}`}>
      <p className="text-2xs font-black uppercase tracking-wider text-slate-500">Rate this session</p>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n > 1 ? 's' : ''} — ${LABELS[n]}`}
            onClick={() => setStars(n)}
            onMouseEnter={() => setHover(n)}
            className="p-0.5 cursor-pointer"
            data-testid={`session-rating-star-${n}`}
          >
            <Star size={20} className={cn('transition-colors', n <= shown ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
          </button>
        ))}
        <span className="ml-1 text-xs font-bold text-slate-600">{LABELS[shown]}</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_REVIEW_LENGTH))}
        rows={2}
        placeholder="Tell others how the session went (optional)"
        className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none"
        data-testid="session-rating-review"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-3xs text-slate-400">{text.length}/{MAX_REVIEW_LENGTH}</span>
        <div className="flex gap-2">
          {rating ? (
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-full text-2xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            disabled={saving || stars < 1}
            onClick={() => void submit()}
            className="px-4 py-1.5 rounded-full text-2xs font-bold text-white bg-[#18181B] hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            data-testid="session-rating-submit"
          >
            {saving ? 'Saving…' : rating ? 'Update rating' : 'Submit rating'}
          </button>
        </div>
      </div>
    </div>
  );
};
