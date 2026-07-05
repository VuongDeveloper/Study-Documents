import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { dictionaryApi } from '@/api/dictionary';
import type { WordDefinitionResponse } from '@/types';
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
  parentWordId: z.string().min(1, 'Pick a parent word'),
  childWordId: z.string().min(1, 'Pick a child word'),
});
type LinkForm = z.infer<typeof linkSchema>;

// --- Custom (extra) field helpers ---
type CustomField = { key: string; value: string };

function extraToFields(extra?: Record<string, unknown>): CustomField[] {
  if (!extra) return [];
  return Object.entries(extra).map(([key, value]) => ({
    key,
    value: value == null ? '' : String(value),
  }));
}

function fieldsToExtra(fields: CustomField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const k = f.key.trim();
    if (k) out[k] = f.value;
  }
  return out;
}

// Read picked files into base64 data URLs (stored inline on the word document).
function filesToDataUrls(files: FileList): Promise<string[]> {
  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }),
    ),
  );
}

// --- Custom fields editor (free-form key/value rows) ---
function CustomFieldsEditor({
  fields,
  onChange,
}: {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
}) {
  const update = (i: number, patch: Partial<CustomField>) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            placeholder="Field name"
            value={f.key}
            onChange={(e) => update(i, { key: e.target.value })}
            className="w-2/5 rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            type="text"
            placeholder="Value"
            value={f.value}
            onChange={(e) => update(i, { value: e.target.value })}
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => onChange(fields.filter((_, idx) => idx !== i))}
            className="px-1 text-sm text-gray-400 hover:text-red-600"
            title="Remove field"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...fields, { key: '', value: '' }])}
        className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
      >
        + Add field
      </button>
    </div>
  );
}

// --- Image uploader (base64 data URLs) ---
function ImageUploader({
  images,
  onChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  return (
    <div>
      {images.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {images.map((src, i) => (
            <div key={i} className="relative">
              <img
                src={src}
                alt={`attachment ${i + 1}`}
                className="h-16 w-16 rounded object-cover ring-1 ring-gray-200"
              />
              <button
                type="button"
                onClick={() => onChange(images.filter((_, idx) => idx !== i))}
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] leading-none text-white hover:bg-red-700"
                title="Remove image"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={async (e) => {
          if (e.target.files?.length) {
            const urls = await filesToDataUrls(e.target.files);
            onChange([...images, ...urls]);
            e.target.value = '';
          }
        }}
        className="block w-full text-xs text-gray-600 file:mr-2 file:rounded file:border-0 file:bg-indigo-50 file:px-2 file:py-1 file:text-xs file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
      />
    </div>
  );
}

// Column count grows with the image count so all tiles fit and shrink together.
function imageGridCols(n: number): number {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  if (n <= 16) return 4;
  return 5;
}

// Image gallery that fills the available height. Up to 20 images shrink to fit with no
// scrolling; beyond 20 they keep a minimum tile size and the gallery scrolls. Clicking a
// tile opens it in the lightbox.
function ImageGallery({ images, onOpen }: { images: string[]; onOpen: (src: string) => void }) {
  const n = images.length;
  const cols = imageGridCols(n);

  const tile = (src: string, i: number, extra: string) => (
    <button
      key={i}
      type="button"
      onClick={() => onOpen(src)}
      className={`overflow-hidden rounded-lg ring-1 ring-gray-200 hover:ring-2 hover:ring-indigo-400 ${extra}`}
      title="Click to enlarge"
    >
      <img src={src} alt={`image ${i + 1}`} className="h-full w-full object-cover" />
    </button>
  );

  // More than 20: keep the ~20-image tile size (square) and let the gallery scroll.
  if (n > 20) {
    return (
      <div
        className="mt-2 grid min-h-0 flex-1 gap-2 overflow-y-auto"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {images.map((src, i) => tile(src, i, 'aspect-square'))}
      </div>
    );
  }

  // Up to 20: a fixed grid whose rows fill the height, so everything is visible at once.
  const rows = Math.ceil(n / cols);
  return (
    <div
      className="mt-2 grid min-h-0 flex-1 gap-2 overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {images.map((src, i) => tile(src, i, ''))}
    </div>
  );
}

// --- Word autocomplete (used by the link form) ---
function WordAutocomplete({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data: results } = useQuery({
    queryKey: ['dictionary-search', debounced],
    queryFn: () => dictionaryApi.listWords(0, 10, debounced).then((r) => r.data),
    enabled: debounced.trim().length > 0,
  });

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange('');
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search by word..."
        className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {open && results && results.length > 0 && (
        <ul className="absolute left-0 right-0 z-10 mt-1 max-h-40 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
          {results.map((w) => (
            <li
              key={w.id}
              onClick={() => {
                onChange(w.id);
                setQuery(w.word);
                setOpen(false);
              }}
              className="cursor-pointer px-3 py-1.5 text-sm hover:bg-indigo-50"
            >
              <p className="font-medium text-gray-900">{w.word}</p>
              {w.meaning && <p className="text-xs text-gray-500">{w.meaning}</p>}
            </li>
          ))}
        </ul>
      )}
      {open && debounced.trim().length > 0 && results && results.length === 0 && (
        <div className="absolute left-0 right-0 z-10 mt-1 rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow-lg">
          No matches.
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
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Images + free-form custom fields are managed outside react-hook-form (dynamic shape).
  const [createImages, setCreateImages] = useState<string[]>([]);
  const [createFields, setCreateFields] = useState<CustomField[]>([]);
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editFields, setEditFields] = useState<CustomField[]>([]);

  // Image lightbox (popup preview)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Close the lightbox with the Escape key while it is open.
  useEffect(() => {
    if (!lightboxSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxSrc(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightboxSrc]);

  // Flat list of all words (or search matches — by word text OR tag, sorted alphabetically).
  const { data: words, isLoading: wordsLoading } = useQuery({
    queryKey: ['dictionary-words', debouncedSearch],
    queryFn: () => dictionaryApi.listWords(0, 500, debouncedSearch || undefined).then((r) => r.data),
  });

  // Fetch selected word details
  const {
    data: selectedWord,
    isLoading: wordLoading,
    error: wordError,
  } = useQuery({
    queryKey: ['dictionary-word', selectedWordId],
    queryFn: () => dictionaryApi.getWord(selectedWordId!).then((r) => r.data),
    enabled: !!selectedWordId,
    retry: false,
  });

  // Parents / children of selected word (for clickable relationship links)
  const { data: parentWords } = useQuery({
    queryKey: ['dictionary-parents', selectedWordId],
    queryFn: () => dictionaryApi.getParents(selectedWordId!).then((r) => r.data),
    enabled: !!selectedWordId && (selectedWord?.parentIds?.length ?? 0) > 0,
  });

  const { data: childWords } = useQuery({
    queryKey: ['dictionary-children', selectedWordId],
    queryFn: () => dictionaryApi.getChildren(selectedWordId!).then((r) => r.data),
    enabled: !!selectedWordId && (selectedWord?.childIds?.length ?? 0) > 0,
  });

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: ['dictionary-words'] });
    queryClient.invalidateQueries({ queryKey: ['dictionary-search'] });
  };

  // Create word form
  const createForm = useForm<WordForm>({ resolver: zodResolver(wordSchema) });

  const openCreateForm = () => {
    setShowCreateForm(true);
    setShowLinkForm(false);
    setFormError('');
    createForm.reset();
    setCreateImages([]);
    setCreateFields([]);
  };

  const createWordMutation = useMutation({
    mutationFn: (data: WordForm) =>
      dictionaryApi.createWord({
        word: data.word,
        meaning: data.meaning,
        usage: data.usage,
        notes: data.notes,
        examples: data.examplesRaw ? data.examplesRaw.split('\n').filter(Boolean) : [],
        tags: data.tagsRaw ? data.tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [],
        images: createImages,
        extra: fieldsToExtra(createFields),
      }),
    onSuccess: () => {
      invalidateLists();
      setShowCreateForm(false);
      createForm.reset();
      setCreateImages([]);
      setCreateFields([]);
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
        images: editImages,
        extra: fieldsToExtra(editFields),
      }),
    onSuccess: () => {
      invalidateLists();
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
      invalidateLists();
      setSelectedWordId(null);
    },
  });

  // Link form
  const linkForm = useForm<LinkForm>({
    resolver: zodResolver(linkSchema),
    defaultValues: { parentWordId: '', childWordId: '' },
  });

  const createLinkMutation = useMutation({
    mutationFn: (data: LinkForm) => dictionaryApi.createLink(data),
    onSuccess: () => {
      invalidateLists();
      queryClient.invalidateQueries({ queryKey: ['dictionary-word', selectedWordId] });
      queryClient.invalidateQueries({ queryKey: ['dictionary-parents', selectedWordId] });
      queryClient.invalidateQueries({ queryKey: ['dictionary-children', selectedWordId] });
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
    setEditImages(word.images || []);
    setEditFields(extraToFields(word.extra));
    setIsEditing(true);
    setFormError('');
  };

  const parentWordIdValue = linkForm.watch('parentWordId');
  const childWordIdValue = linkForm.watch('childWordId');

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-6">
      {/* Left panel: flat word list */}
      <div className="flex w-80 flex-shrink-0 flex-col rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {debouncedSearch ? 'Search Results' : 'All Words'}
          </h2>
          <div className="flex gap-1">
            <button
              onClick={openCreateForm}
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

        {/* Search bar */}
        <div className="border-b border-gray-200 px-3 py-2">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by word or tag..."
              className="block w-full rounded border border-gray-300 px-2 py-1 pr-7 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 px-1 text-xs text-gray-400 hover:text-gray-600"
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Create word form */}
        {showCreateForm && (
          <div className="max-h-[60vh] overflow-y-auto border-b border-gray-200 bg-gray-50 px-4 py-3">
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
              <textarea
                placeholder="Meaning"
                rows={2}
                {...createForm.register('meaning')}
                className="block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <textarea
                placeholder="Usage"
                rows={2}
                {...createForm.register('usage')}
                className="block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <textarea
                placeholder="Notes"
                rows={2}
                {...createForm.register('notes')}
                className="block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <textarea
                placeholder="Examples (one per line)"
                rows={3}
                {...createForm.register('examplesRaw')}
                className="block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <input
                type="text"
                placeholder="Tags (comma-separated)"
                {...createForm.register('tagsRaw')}
                className="block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <div>
                <label className="block text-xs font-medium text-gray-600">Images</label>
                <div className="mt-1">
                  <ImageUploader images={createImages} onChange={setCreateImages} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Custom fields</label>
                <div className="mt-1">
                  <CustomFieldsEditor fields={createFields} onChange={setCreateFields} />
                </div>
              </div>
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
              className="space-y-3"
            >
              <WordAutocomplete
                label="Parent word"
                value={parentWordIdValue}
                onChange={(id) => linkForm.setValue('parentWordId', id, { shouldValidate: true })}
                error={linkForm.formState.errors.parentWordId?.message}
              />
              <WordAutocomplete
                label="Child word"
                value={childWordIdValue}
                onChange={(id) => linkForm.setValue('childWordId', id, { shouldValidate: true })}
                error={linkForm.formState.errors.childWordId?.message}
              />
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

        {/* Word list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {wordsLoading ? (
            <p className="px-2 py-4 text-center text-sm text-gray-500">Loading words...</p>
          ) : !words || words.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-gray-500">
              {debouncedSearch ? 'No matches.' : 'No words yet. Create one!'}
            </p>
          ) : (
            words.map((word) => (
              <div
                key={word.id}
                onClick={() => setSelectedWordId(word.id)}
                className={`cursor-pointer rounded px-2 py-1 text-sm transition-colors ${
                  selectedWordId === word.id
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <p className="font-medium">{word.word}</p>
                {word.meaning && <p className="truncate text-xs text-gray-500">{word.meaning}</p>}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel: Word detail / edit */}
      <div className="flex-1 rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        {!selectedWordId ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Select a word from the list to view details
          </div>
        ) : wordLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Loading word...
          </div>
        ) : wordError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-red-600">
            <p>Failed to load word.</p>
            <p className="text-xs text-gray-500">
              {(wordError as AxiosError<{ message?: string }>)?.response?.data?.message ||
                (wordError as Error)?.message}
            </p>
          </div>
        ) : !selectedWord ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            No data.
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
              <div>
                <label className="block text-sm font-medium text-gray-700">Images</label>
                <div className="mt-1">
                  <ImageUploader images={editImages} onChange={setEditImages} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Custom fields</label>
                <div className="mt-1">
                  <CustomFieldsEditor fields={editFields} onChange={setEditFields} />
                </div>
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
          /* Detail view (card grid; images grow to fill the panel height) */
          <div className="flex h-full flex-col overflow-y-auto p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{selectedWord.word}</h2>
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

            {/* Text fields as cards */}
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {selectedWord.meaning && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Meaning</h3>
                  <p className="mt-1 text-sm text-gray-900">{selectedWord.meaning}</p>
                </div>
              )}

              {selectedWord.usage && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Usage</h3>
                  <p className="mt-1 text-sm text-gray-900">{selectedWord.usage}</p>
                </div>
              )}

              {selectedWord.notes && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Notes</h3>
                  <p className="mt-1 text-sm text-gray-900">{selectedWord.notes}</p>
                </div>
              )}

              {selectedWord.examples && selectedWord.examples.length > 0 && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Examples</h3>
                  <ul className="mt-1 list-inside list-disc space-y-1">
                    {selectedWord.examples.map((ex, i) => (
                      <li key={i} className="text-sm text-gray-700">{ex}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedWord.extra && Object.keys(selectedWord.extra).length > 0 && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Custom Fields</h3>
                  <dl className="mt-1 space-y-1">
                    {Object.entries(selectedWord.extra).map(([key, value]) => (
                      <div key={key} className="flex gap-2 text-sm">
                        <dt className="font-medium capitalize text-gray-600">{key}:</dt>
                        <dd className="text-gray-900">{value == null ? '' : String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {selectedWord.tags && selectedWord.tags.length > 0 && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Tags</h3>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedWord.tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setSearchQuery(tag)}
                        className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-200"
                        title={`Search by "${tag}"`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(selectedWord.parentIds?.length > 0 || selectedWord.childIds?.length > 0) && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Relationships</h3>
                  <div className="mt-1 space-y-2 text-sm text-gray-700">
                    {selectedWord.parentIds?.length > 0 && (
                      <div>
                        <span className="text-gray-500">Parents: </span>
                        {parentWords && parentWords.length > 0 ? (
                          parentWords.map((p, i) => (
                            <span key={p.id}>
                              <button
                                onClick={() => setSelectedWordId(p.id)}
                                className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                              >
                                {p.word}
                              </button>
                              {i < parentWords.length - 1 && ', '}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400">Loading...</span>
                        )}
                      </div>
                    )}
                    {selectedWord.childIds?.length > 0 && (
                      <div>
                        <span className="text-gray-500">Children: </span>
                        {childWords && childWords.length > 0 ? (
                          childWords.map((c, i) => (
                            <span key={c.id}>
                              <button
                                onClick={() => setSelectedWordId(c.id)}
                                className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                              >
                                {c.word}
                              </button>
                              {i < childWords.length - 1 && ', '}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400">Loading...</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Images — grow to fill the remaining height (placeholder when there are none) */}
            {selectedWord.images && selectedWord.images.length > 0 ? (
              <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 p-4">
                <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Images</h3>
                <ImageGallery images={selectedWord.images} onOpen={setLightboxSrc} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => startEditing(selectedWord)}
                className="mt-4 flex min-h-[160px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 p-4 text-center hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <span className="text-sm font-medium text-indigo-600">Edit to add image</span>
              </button>
            )}

            {/* Metadata footer */}
            <div className="mt-4 border-t border-gray-200 pt-4 text-xs text-gray-400">
              <p>Created: {new Date(selectedWord.createdAt).toLocaleString()}</p>
              <p>Updated: {new Date(selectedWord.updatedAt).toLocaleString()}</p>
            </div>
          </div>
        )}
      </div>

      {/* Image lightbox popup */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg text-gray-700 shadow hover:bg-white"
            title="Close (Esc)"
          >
            ✕
          </button>
          <img
            src={lightboxSrc}
            alt="preview"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
