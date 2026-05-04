import { useEditor, EditorContent } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { StarterKit } from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Image } from '@tiptap/extension-image'
import { CharacterCount } from '@tiptap/extensions'
import { BsTypeH1, BsTypeH2 } from 'react-icons/bs'
import { FaBold, FaItalic, FaStrikethrough, FaUnderline, FaHighlighter } from 'react-icons/fa'
import { RiListOrdered, RiListUnordered } from 'react-icons/ri'
import { TbBlockquote } from 'react-icons/tb'
import { FaAlignCenter, FaAlignJustify, FaAlignLeft, FaAlignRight } from 'react-icons/fa'
import { MdBorderColor } from 'react-icons/md'
import { BiImageAdd } from 'react-icons/bi'
import { CgSpinner } from 'react-icons/cg'
import './Editor.css'

type TipTapProps = {
  value: string
  onChange: (content: string) => void
  placeholder?: string
  uploadImage?: (file: File) => Promise<string>
}

const SWATCHES = [
  '#000000',
  '#333333',
  '#666666',
  '#999999',
  '#CCCCCC',
  '#FFFFFF',
  '#FF0000',
  '#FF6600',
  '#FFCC00',
  '#00FF00',
  '#00CCFF',
  '#0066FF',
  '#6600FF',
  '#FF00CC',
  '#FF0066',
  '#CC6600',
  '#99CC00',
  '#00CC99',
  '#0099CC',
  '#6600CC',
  '#CC0066',
  '#CC3300',
  '#99CC33',
  '#33CC99',
  '#3399CC',
  '#9966CC',
  '#CC3399',
  '#CC6633',
  '#99CC66',
  '#66CC99',
]

export default function TipTap({
  value,
  onChange,
  placeholder = '',
  uploadImage,
}: TipTapProps) {
  const [imageUploadLoading, setImageUploadLoading] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      CharacterCount.configure({ limit: null }),
      Placeholder.configure({
        placeholder,
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      TextStyle,
      Color,
    ],
    content: value || '<p></p>',
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML())
    },
    immediatelyRender: false,
  })

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '<p></p>', { emitUpdate: false })
    }
  }, [editor, value])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (showColorPicker && !target.closest('.color-picker-container')) {
        setShowColorPicker(false)
      }
    }
    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColorPicker])

  if (!editor) return null

  const chars = editor.storage.characterCount?.characters() ?? 0

  return (
    <div className="tiptap-editor-container">
      <div className="tiptap-toolbar">
        <button
          type="button"
          aria-label="Bold"
          className={editor.isActive('bold') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <FaBold />
        </button>
        <button
          type="button"
          aria-label="Italic"
          className={editor.isActive('italic') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <FaItalic />
        </button>
        <button
          type="button"
          aria-label="Strikethrough"
          className={editor.isActive('strike') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <FaStrikethrough />
        </button>
        <button
          type="button"
          aria-label="Underline"
          className={editor.isActive('underline') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <FaUnderline />
        </button>
        <button
          type="button"
          aria-label="Highlight"
          className={editor.isActive('highlight') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        >
          <FaHighlighter />
        </button>
        <div className="color-picker-container">
          <button
            type="button"
            aria-label="Text color"
            className={`color-picker-button ${showColorPicker ? 'active' : ''}`}
            onClick={() => setShowColorPicker(!showColorPicker)}
          >
            <MdBorderColor />
          </button>
          {showColorPicker && (
            <div className="color-picker-dropdown">
              <div className="color-picker-header">
                <span>Text Color</span>
                <button type="button" className="close-color-picker" onClick={() => setShowColorPicker(false)}>
                  ×
                </button>
              </div>
              <div className="color-options">
                {SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="color-option"
                    style={{ backgroundColor: color }}
                    title={color}
                    onClick={() => {
                      editor.chain().focus().setColor(color).run()
                      setShowColorPicker(false)
                    }}
                  />
                ))}
              </div>
              <div className="color-picker-actions">
                <button
                  type="button"
                  className="remove-color-button"
                  onClick={() => {
                    editor.chain().focus().unsetColor().run()
                    setShowColorPicker(false)
                  }}
                >
                  Remove Color
                </button>
              </div>
            </div>
          )}
        </div>
        <button type="button" aria-label="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <BsTypeH1 />
        </button>
        <button type="button" aria-label="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <BsTypeH2 />
        </button>
        <button type="button" aria-label="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <RiListUnordered />
        </button>
        <button type="button" aria-label="Ordered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <RiListOrdered />
        </button>
        <button type="button" aria-label="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <TbBlockquote />
        </button>
        <button type="button" aria-label="Align left" onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <FaAlignLeft />
        </button>
        <button type="button" aria-label="Align center" onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <FaAlignCenter />
        </button>
        <button type="button" aria-label="Align right" onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <FaAlignRight />
        </button>
        <button type="button" aria-label="Justify" onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
          <FaAlignJustify />
        </button>
        {uploadImage ? (
          <label aria-label="Insert image">
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                setImageUploadLoading(true)
                try {
                  const imageUrl = await uploadImage(file)
                  if (imageUrl) editor.chain().focus().setImage({ src: imageUrl }).run()
                } catch (err) {
                  console.error(err)
                } finally {
                  setImageUploadLoading(false)
                }
              }}
              disabled={imageUploadLoading}
            />
            {imageUploadLoading ? <CgSpinner className="animate-spin w-4 h-4" /> : <BiImageAdd />}
          </label>
        ) : null}
      </div>
      <div className="tiptap-editor">
        <EditorContent editor={editor} />
      </div>
      <div className="tiptap-character-count">
        <span>Characters: {chars}</span>
      </div>
    </div>
  )
}
