import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { dictionaryApi } from '@/api/dictionary';
import type { WordGraphResponse, WordDefinitionResponse } from '@/types';
import type { AxiosError } from 'axios';

// --- Schemas ---
const wordSchema = z.object({
  word: z.string().min(1, 'Word is required'),
  meaning: z.string().optional(),
  usage: z.string().optional(),
  notes: z.string().optional(),
  examplesRaw: z.string().optional(),
  tagsRaw: z.string().optional(),
});
type WordForm = z.infer<typeof wordSchema>;

const linkSchema = z.object({
  parentWordId: z.string().min(1, 'Parent word ID is required'),
  childWordId: z.string().min(1, 'Child word ID is required'),
});
type LinkForm = z.infer<typeof linkSchema>;

// --- Recursive tree node ---
function TreeNode({
  node,
  selectedId,
  onSelect,
}: {
  node: WordGraphResponse;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="ml-2">
      <div
        className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm transition-colors ${
          selectedId === node.id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-gray-400 hover:text-gray-600"
          >
            <svg
              className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : (
          <span className="inline-block h-5 w-5 flex-shrink-0" />
        )}
        <span onClick={() => onSelect(node.id)} className="flex-1 truncate">
          {node.word}
        </span>
      </div>
      {expanded && hasChildren && (
        <div className="ml-3 border-l border-gray-200 pl-1">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Main page ---
export default function DictionaryPage() {
  const queryClient = useQueryClient();
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Fetch graph
  const { data: graph, isLoading: graphLoading } = useQuery({
    queryKey: ['dictionary-graph'],
    queryFn: () => dictionaryApi.getGraph().then((r) => r.data),
  });

  // Fetch selected word details
  const { data: selectedWord, isLoading: wordLoading } = useQuery({
    queryKey: ['dictionary-word', selectedWordId],
    queryFn: () => dictionaryApi.getWord(selectedWordId!).then((r) => r.data),
    enabled: !!selectedWordId,
  });

  // Create word form
  const createForm = useForm<WordForm>({ resolver: zodResolver(wordSchema) });

  const createWordMutation = useMutation({
    mutationFn: (data: WordForm) =>
      dictionaryApi.createWord({
        word: data.word,
        meaning: data.meaning,
        usage: data.usage,
        notes: data.notes,
        examples: data.examplesRaw ? data.examplesRaw.split('\n').filter(Boolean) : [],
        tags: data.tagsRaw ? data.tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dictionary-graph'] });
      setShowCreateForm(false);
      createForm.reset();
      setFormError('');
    },
    onError: (err: AxiosError<{ message?: string }>) => {
      setFormError(err.response?.data?.message || 'Failed to create word.');
    },
  });

  // Edit word form
  const editForm = useForm<WordForm>({ resolver: zodResolver(wordSchema) });

  const updateWordMutation = useMutation({
    mutationFn: (data: WordForm) =>
      dictionaryApi.updateWord(selectedWordId!, {
        word: data.word,
        meaning: data.meaning,
        usage: data.usage,
        notes: data.notes,
        examples: data.examplesRaw ? data.examplesRaw.split('\n').filter(Boolean) : [],
        tags: data.tagsRaw ? data.tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dictionary-graph'] });
      queryClient.invalidateQueries({ queryKey: ['dictionary-word', selectedWordId] });
      setIsEditing(false);
      setFormError('');
    },
    onError: (err: AxiosError<{ message?: string }>) => {
      setFormError(err.response?.data?.message || 'Failed to update word.');
    },
  });

  const deleteWordMutation = useMutation({
    mutationFn: (id: string) => dictionaryApi.deleteWord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dictionary-graph'] });
      setSelectedWordId(null);
    },
  });

  // Link form
  const linkForm = useForm<LinkForm>({ resolver: zodResolver(linkSchema) });

  const createLinkMutation = useMutation({
    mutationFn: (data: LinkForm) => dictionaryApi.createLink(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dictionary-graph'] });
      setShowLinkForm(false);
      linkForm.reset();
      setFormError('');
    },
    onError: (err: AxiosError<{ message?: string }>) => {
      setFormError(err.response?.data?.message || 'Failed to create link.');
    },
  });

  const startEditing = (word: WordDefinitionResponse) => {
    editForm.reset({
      word: word.word,
      meaning: word.meaning || '',
      usage: word.usage || '',
      notes: word.notes || '',
      examplesRaw: word.examples?.join('\n') || '',
      tagsRaw: word.tags?.join(', ') || '',
    });
    setIsEditing(true);
    setFormError('');
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-6">
      {/* Left panel: Tree */}
      <div className="flex w-80 flex-shrink-0 flex-col rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Word Tree</h2>
          <div className="flex gap-1">
            <button
              onClick={() => { setShowCreateForm(true); setShowLinkForm(false); setFormError(''); }}
              className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700"
              title="Add word"
            >
              + Word
            </button>
            <button
              onClick={() => { setShowLinkForm(true); setShowCreateForm(false); setFormError(''); }}
              className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              title="Link words"
            >
              + Link
            </button>
          </div>
        </div>

        {/* Create word form */}
        {showCreateForm && (
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
            <form
              onSubmit={createForm.handleSubmit((data) => createWordMutation.mutate(data))}
              className="space-y-2"
            >
              <input
                type="text"
                placeholder="Word"
                {...createForm.register('word')}
                className="block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {createForm.formState.errors.word && (
                <p className="text-xs text-red-600">{createForm.formState.errors.word.message}</p>
              )}
              <input
                type="text"
                placeholder="Meaning"
                {...createForm.register('meaning')}
                className="block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {formError && <p className="text-xs text-red-600">{formError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createWordMutation.isPending}
                  className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createWordMutation.isPending ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreateForm(false); setFormError(''); }}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Link form */}
        {showLinkForm && (
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
            <form
              onSubmit={linkForm.handleSubmit((data) => createLinkMutation.mutate(data))}
              className="space-y-2"
            >
              <input
                type="text"
                placeholder="Parent Word ID"
                {...linkForm.register('parentWordId')}
                className="block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {linkForm.formState.errors.parentWordId && (
                <p className="text-xs text-red-600">{linkForm.formState.errors.parentWordId.message}</p>
              )}
              <input
                type="text"
                placeholder="Child Word ID"
                {...linkForm.register('childWordId')}
                className="block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {linkForm.formState.errors.childWordId && (
                <p className="text-xs text-red-600">{linkForm.formState.errors.childWordId.message}</p>
              )}
              {formError && <p className="text-xs text-red-600">{formError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createLinkMutation.isPending}
                  className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createLinkMutation.isPending ? 'Linking...' : 'Link'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowLinkForm(false); setFormError(''); }}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tree */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {graphLoading ? (
            <p className="px-2 py-4 text-center text-sm text-gray-500">Loading words...</p>
          ) : !graph || graph.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-gray-500">No words yet. Create one!</p>
          ) : (
            graph.map((root) => (
              <TreeNode
                key={root.id}
                node={root}
                selectedId={selectedWordId}
                onSelect={setSelectedWordId}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel: Word detail / edit */}
      <div className="flex-1 rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        {!selectedWordId ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Select a word from the tree to view details
          </div>
        ) : wordLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Loading word...
          </div>
        ) : !selectedWord ? (
          <div className="flex h-full items-center justify-center text-sm text-red-500">
            Word not found
          </div>
        ) : isEditing ? (
          /* Edit form */
          <div className="h-full overflow-y-auto p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Edit Word</h2>
              <button
                onClick={() => { setIsEditing(false); setFormError(''); }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
            {formError && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</div>
            )}
            <form
              onSubmit={editForm.handleSubmit((data) => updateWordMutation.mutate(data))}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700">Word</label>
                <input
                  type="text"
                  {...editForm.register('word')}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {editForm.formState.errors.word && (
                  <p className="mt-1 text-xs text-red-600">{editForm.formState.errors.word.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Meaning</label>
                <textarea
                  {...editForm.register('meaning')}
                  rows={2}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Usage</label>
                <textarea
                  {...editForm.register('usage')}
                  rows={2}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  {...editForm.register('notes')}
                  rows={2}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Examples (one per line)
                </label>
                <textarea
                  {...editForm.register('examplesRaw')}
                  rows={3}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  {...editForm.register('tagsRaw')}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={updateWordMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {updateWordMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        ) : (
          /* Detail view */
          <div className="h-full overflow-y-auto p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{selectedWord.word}</h2>
                <p className="mt-1 text-xs text-gray-400">ID: {selectedWord.id}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => startEditing(selectedWord)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete "${selectedWord.word}"?`)) {
                      deleteWordMutation.mutate(selectedWord.id);
                    }
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              {selectedWord.meaning && (
                <div>
                  <h3 className="text-xs font-medium uppercase text-gray-500">Meaning</h3>
                  <p className="mt-1 text-sm text-gray-900">{selectedWord.meaning}</p>
                </div>
              )}

              {selectedWord.usage && (
                <div>
                  <h3 className="text-xs font-medium uppercase text-gray-500">Usage</h3>
                  <p className="mt-1 text-sm text-gray-900">{selectedWord.usage}</p>
                </div>
              )}

              {selectedWord.notes && (
                <div>
                  <h3 className="text-xs font-medium uppercase text-gray-500">Notes</h3>
                  <p className="mt-1 text-sm text-gray-900">{selectedWord.notes}</p>
                </div>
              )}

              {selectedWord.examples && selectedWord.examples.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium uppercase text-gray-500">Examples</h3>
                  <ul className="mt-1 list-inside list-disc space-y-1">
                    {selectedWord.examples.map((ex, i) => (
                      <li key={i} className="text-sm text-gray-700">{ex}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedWord.tags && selectedWord.tags.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium uppercase text-gray-500">Tags</h3>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedWord.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(selectedWord.parentIds?.length > 0 || selectedWord.childIds?.length > 0) && (
                <div>
                  <h3 className="text-xs font-medium uppercase text-gray-500">Relationships</h3>
                  <div className="mt-1 space-y-1 text-sm text-gray-700">
                    {selectedWord.parentIds?.length > 0 && (
                      <p>Parents: {selectedWord.parentIds.join(', ')}</p>
                    )}
                    {selectedWord.childIds?.length > 0 && (
                      <p>Children: {selectedWord.childIds.join(', ')}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 pt-4 text-xs text-gray-400">
                <p>Created: {new Date(selectedWord.createdAt).toLocaleString()}</p>
                <p>Updated: {new Date(selectedWord.updatedAt).toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
