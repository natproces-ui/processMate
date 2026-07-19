'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, ImagePlus, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { uploadImage } from '@/lib/storage';

const COLORS = [
  { label: 'Texte', value: null },
  { label: 'Vert', value: '#047857' },
  { label: 'Orange', value: '#c2410c' },
  { label: 'Bleu', value: '#1d4ed8' },
  { label: 'Rouge', value: '#dc2626' },
];

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Image,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'rich-content min-h-[100px] px-3 py-2 text-sm focus:outline-none',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  if (!editor) return null;

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    setUploading(true);
    const url = await uploadImage(file);
    setUploading(false);
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
      <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded ${editor.isActive('bold') ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-200'}`}
          title="Gras"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded ${editor.isActive('italic') ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-200'}`}
          title="Italique"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-slate-300 mx-1" />
        {COLORS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => (c.value ? editor.chain().focus().setColor(c.value).run() : editor.chain().focus().unsetColor().run())}
            className="w-4 h-4 rounded-full border border-slate-300 shrink-0"
            style={{ backgroundColor: c.value ?? '#0f172a' }}
            title={c.label}
          />
        ))}
        <div className="w-px h-4 bg-slate-300 mx-1" />
        <label className="p-1.5 rounded text-slate-500 hover:bg-slate-200 cursor-pointer" title="Insérer une image">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
          <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} className="hidden" />
        </label>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
