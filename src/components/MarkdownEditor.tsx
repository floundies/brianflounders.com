import { useEffect, useRef } from 'react'

type Props = {
  value: string
  onChange: (v: string) => void
}

/** Optional NIP-96 uploader — set VITE_NIP96_UPLOAD_URL (and optional VITE_NIP96_AUTH) */
async function uploadToNip96(file: File): Promise<string> {
  const endpoint = import.meta.env.VITE_NIP96_UPLOAD_URL as string | undefined
  if (!endpoint) throw new Error('No upload endpoint: set VITE_NIP96_UPLOAD_URL')

  const auth = import.meta.env.VITE_NIP96_AUTH as string | undefined
  const fd = new FormData()
  fd.append('file', file)

  const res = await fetch(endpoint, {
    method: 'POST',
    body: fd,
    headers: auth ? { Authorization: `Bearer ${auth}` } : undefined,
  })
  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  const j: any = await res.json().catch(() => ({}))

  // NIP-96 responses vary. Prefer direct "url", else look inside nip94_event tags.
  const direct = j?.url || j?.data?.url
  if (direct) return String(direct)

  const ev = j?.nip94_event
  if (ev?.tags?.length) {
    const urlTag = ev.tags.find((t: string[]) => t[0] === 'url')
    if (urlTag) return urlTag[1]
  }
  throw new Error('Upload endpoint did not return a URL')
}

export default function MarkdownEditor({ value, onChange }: Props) {
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const smdeRef = useRef<any>(null)

  useEffect(() => {
    let disposed = false

    // inject SimpleMDE CSS once
    if (!document.querySelector('link[data-simplemde]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://cdn.jsdelivr.net/npm/simplemde@1.11.2/dist/simplemde.min.css'
      link.setAttribute('data-simplemde', '1')
      document.head.appendChild(link)
    }

    ;(async () => {
      // load SimpleMDE via CDN
      if (!(window as any).SimpleMDE) {
        await new Promise<void>((resolve) => {
          const s = document.createElement('script')
          s.src = 'https://cdn.jsdelivr.net/npm/simplemde@1.11.2/dist/simplemde.min.js'
          s.onload = () => resolve()
          document.head.appendChild(s)
        })
      }
      if (disposed) return

      const SimpleMDE = (window as any).SimpleMDE
      const mde = new SimpleMDE({
        element: taRef.current!,
        spellChecker: false,
        status: false,
        autosave: { enabled: false },
        forceSync: true,
        toolbar: [
          'bold', 'italic', 'heading', '|',
          'quote', 'unordered-list', 'ordered-list', '|',
          'link',
          {
            name: 'image-upload',
            className: 'fa fa-picture-o',
            title: 'Insert image (upload or URL)',
            action: async () => {
              try {
                // prefer upload if endpoint configured, else prompt for URL
                if (import.meta.env.VITE_NIP96_UPLOAD_URL) {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = 'image/*'
                  input.onchange = async () => {
                    const file = input.files?.[0]
                    if (!file) return
                    mde.codemirror.replaceSelection('\n\nUploading image…\n\n')
                    try {
                      const url = await uploadToNip96(file)
                      mde.codemirror.replaceSelection(`\n\n![](${url})\n\n`)
                    } catch (e: any) {
                      alert(e?.message || 'Upload failed')
                    }
                  }
                  input.click()
                } else {
                  const url = window.prompt('Image URL (https://…):')
                  if (url) mde.codemirror.replaceSelection(`\n\n![](${url})\n\n`)
                }
              } catch (e: any) {
                alert(e?.message || 'Could not insert image')
              }
            }
          },
          '|', 'table', 'horizontal-rule', '|',
          'preview', 'side-by-side', 'guide'
        ]
      })
      // initial value
      mde.value(value || '')

      // keep React state in sync
      mde.codemirror.on('change', () => onChange(mde.value()))

      // drag & drop / paste to upload
      const tryUpload = async (files: FileList | null) => {
        if (!files || !files.length) return false
        if (!import.meta.env.VITE_NIP96_UPLOAD_URL) return false
        const file = files[0]
        mde.codemirror.replaceSelection('\n\nUploading image…\n\n')
        try {
          const url = await uploadToNip96(file)
          mde.codemirror.replaceSelection(`\n\n![](${url})\n\n`)
        } catch (e: any) {
          alert(e?.message || 'Upload failed')
        }
        return true
      }
      mde.codemirror.getWrapperElement().addEventListener('drop', (e: any) => {
        if (e?.dataTransfer?.files) tryUpload(e.dataTransfer.files)
      })
      mde.codemirror.getWrapperElement().addEventListener('paste', (e: any) => {
        const items = e.clipboardData?.items
        if (!items) return
        const files = Array.from(items).map(i => i.getAsFile()).filter(Boolean) as File[]
        if (files.length) tryUpload({ 0: files[0], length: 1, item: () => files[0] } as any)
      })

      smdeRef.current = mde
    })()

    return () => {
      disposed = true
      if (smdeRef.current) {
        // SimpleMDE doesn't expose a destroy API; remove the wrapper
        const wrapper = smdeRef.current?.codemirror?.getWrapperElement?.()
        wrapper?.parentElement?.replaceWith(taRef.current!)
        smdeRef.current = null
      }
    }
  }, [])

  // keep external value updates reflected in editor
  useEffect(() => {
    if (smdeRef.current && smdeRef.current.value() !== value) {
      smdeRef.current.value(value || '')
    }
  }, [value])

  return (
    <textarea
      ref={taRef}
      defaultValue={value}
      placeholder="# Markdown\nWrite your travel story…"
      style={{ minHeight: 320 }}
    />
  )
}
