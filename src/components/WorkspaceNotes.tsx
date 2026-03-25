import React, { useState, useEffect, useCallback } from 'react';
import {
  Pin,
  Trash2,
  AlertTriangle,
  X,
  Loader2,
  StickyNote,
  Send,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Deal } from '../types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Note {
  id: string;
  deal_id: string;
  author_id: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  profiles?: { name: string } | null;
}

interface Props {
  deal: Deal;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;

  const d = new Date(iso);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WorkspaceNotes({ deal }: Props) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  /* ---- Fetch ---- */
  const fetchNotes = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('deal_notes')
      .select('*, profiles:author_id(name)')
      .eq('deal_id', deal.id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
    } else {
      setNotes(data as Note[]);
    }
    setLoading(false);
  }, [deal.id]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  /* ---- Add note ---- */
  const addNote = async () => {
    const text = content.trim();
    if (!text || !profile) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('deal_notes').insert({
      deal_id: deal.id,
      author_id: profile.id,
      content: text,
    });
    if (err) {
      setError(err.message);
    } else {
      setContent('');
      await fetchNotes();
    }
    setSaving(false);
  };

  /* ---- Toggle pin ---- */
  const togglePin = async (note: Note) => {
    const { error: err } = await supabase
      .from('deal_notes')
      .update({ is_pinned: !note.is_pinned })
      .eq('id', note.id);
    if (err) setError(err.message);
    else await fetchNotes();
  };

  /* ---- Delete ---- */
  const deleteNote = async (note: Note) => {
    if (!window.confirm('Delete this note?')) return;
    const { error: err } = await supabase.from('deal_notes').delete().eq('id', note.id);
    if (err) setError(err.message);
    else await fetchNotes();
  };

  /* ---- Render ---- */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-base-content/40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error toast */}
      {error && (
        <div className="alert alert-error shadow-sm">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setError(null)}>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Add note */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body p-4 space-y-2">
          <textarea
            className="textarea textarea-bordered w-full text-sm"
            placeholder="Add an internal note…"
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote();
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-base-content/40">Ctrl+Enter to submit</span>
            <button
              className="btn btn-primary btn-sm"
              onClick={addNote}
              disabled={saving || !content.trim()}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Add Note
            </button>
          </div>
        </div>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <StickyNote className="w-10 h-10 text-base-content/20 mb-2" />
          <p className="text-sm text-base-content/50">
            No internal notes yet. Add a note to track important deal details.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => {
            const authorName =
              (note.profiles && typeof note.profiles === 'object' ? note.profiles.name : null) ?? 'Unknown';
            const isAuthor = profile?.id === note.author_id;

            return (
              <div
                key={note.id}
                className={`card bg-base-100 border border-base-300 ${
                  note.is_pinned ? 'border-l-4 border-l-primary' : ''
                }`}
              >
                <div className="card-body p-3 sm:p-4">
                  {/* Content */}
                  <p className="text-sm whitespace-pre-wrap text-base-content">{note.content}</p>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-base-content/50">
                      {authorName} · {relativeTime(note.created_at)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        className={`btn btn-ghost btn-xs btn-square ${
                          note.is_pinned ? 'text-primary' : 'text-base-content/30'
                        }`}
                        onClick={() => togglePin(note)}
                        title={note.is_pinned ? 'Unpin' : 'Pin'}
                      >
                        <Pin className={`w-3.5 h-3.5 ${note.is_pinned ? 'fill-current' : ''}`} />
                      </button>
                      {isAuthor && (
                        <button
                          className="btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-error"
                          onClick={() => deleteNote(note)}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
