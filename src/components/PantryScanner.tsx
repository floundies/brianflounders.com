import * as React from 'react'

const { useState, useRef, useCallback } = React

type Step = 'capture' | 'ingredients' | 'recipes'

interface Macros {
  calories: number
  protein: string
  carbs: string
  fat: string
  fiber: string
}

interface Recipe {
  name: string
  time: string
  description: string
  ingredients: string[]
  steps: string[]
  macros: Macros
  source: 'known' | 'custom'
  rating?: number
  origin?: string
}

async function callGemini(body: object): Promise<any> {
  const res = await fetch('/api/gemini?model=gemini-2.5-flash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No response from Gemini')
  return text
}

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.3
  const stars: React.ReactNode[] = []
  for (let i = 0; i < full; i++) stars.push(<span key={`f${i}`} className="pantry__star pantry__star--full">★</span>)
  if (half) stars.push(<span key="h" className="pantry__star pantry__star--half">★</span>)
  const empty = 5 - full - (half ? 1 : 0)
  for (let i = 0; i < empty; i++) stars.push(<span key={`e${i}`} className="pantry__star pantry__star--empty">☆</span>)
  return <span className="pantry__stars">{stars}</span>
}

export default function PantryScanner() {
  const [step, setStep] = useState<Step>('capture')
  const [imageData, setImageData] = useState<string | null>(null)
  const [ingredients, setIngredients] = useState<{ name: string; checked: boolean }[]>([])
  const [extraInput, setExtraInput] = useState('')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraActive(false)
  }, [])

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setImageData(reader.result as string)
      stopCamera()
    }
    reader.readAsDataURL(file)
  }, [stopCamera])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setCameraActive(true)
    } catch {
      setError('Could not access camera. Try uploading a photo instead.')
    }
  }, [])

  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    setImageData(canvas.toDataURL('image/jpeg', 0.85))
    stopCamera()
  }, [stopCamera])

  const identifyIngredients = useCallback(async () => {
    if (!imageData) return
    setLoading(true)
    setError('')
    try {
      const base64 = imageData.split(',')[1]
      const mimeType = imageData.split(';')[0].split(':')[1]
      const text = await callGemini({
        contents: [{
          parts: [
            { text: 'Look at this image of food items (pantry, fridge, or groceries). List every food ingredient you can identify, one per line. Only list the ingredient names, nothing else. Be specific (e.g. "sharp cheddar cheese" not just "cheese"). If you cannot identify any food items, respond with "NO_FOOD_FOUND".' },
            { inlineData: { mimeType, data: base64 } },
          ],
        }],
      })
      if (text.includes('NO_FOOD_FOUND')) {
        setError("Couldn't spot any food items. Try a clearer photo or upload a different one.")
        return
      }
      const items = text.split('\n')
        .map((s: string) => s.replace(/^[-•*\d.)\s]+/, '').trim())
        .filter(Boolean)
        .map((name: string) => ({ name, checked: true }))
      setIngredients(items)
      setExtraInput('')
      setStep('ingredients')
    } catch (e: any) {
      setError(e.message || 'Failed to identify ingredients')
    } finally {
      setLoading(false)
    }
  }, [imageData])

  const toggleIngredient = useCallback((index: number) => {
    setIngredients(prev => prev.map((item, i) => i === index ? { ...item, checked: !item.checked } : item))
  }, [])

  const removeIngredient = useCallback((index: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== index))
  }, [])

  const addExtra = useCallback(() => {
    const trimmed = extraInput.trim()
    if (!trimmed) return
    // support comma-separated additions
    const newItems = trimmed.split(',').map(s => s.trim()).filter(Boolean)
    setIngredients(prev => [...prev, ...newItems.map(name => ({ name, checked: true }))])
    setExtraInput('')
  }, [extraInput])

  const generateRecipes = useCallback(async () => {
    const selected = ingredients.filter(i => i.checked).map(i => i.name)
    if (selected.length === 0) return
    setLoading(true)
    setError('')
    try {
      const text = await callGemini({
        contents: [{
          parts: [{
            text: `I have these ingredients:\n${selected.join('\n')}\n\nGive me 5 recipes. For the first 3, suggest well-known, highly-rated recipes from popular cooking sites (AllRecipes, Food Network, Bon Appetit, Serious Eats, etc.) that use primarily these ingredients. Include the source site name and rating if known. For the last 2, create your own custom recipes.\n\nIt's okay to assume common pantry staples like salt, pepper, oil, butter, garlic.\n\nFor EACH recipe include estimated macronutrients per serving.\n\nRespond in this exact JSON format (no markdown fences, no other text):\n[{"name":"...","time":"...","description":"one sentence","ingredients":["..."],"steps":["..."],"macros":{"calories":000,"protein":"00g","carbs":"00g","fat":"00g","fiber":"00g"},"source":"known or custom","rating":4.7,"origin":"AllRecipes"}]`,
          }],
        }],
        generationConfig: { temperature: 0.7 },
      })
      const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      const parsed: Recipe[] = JSON.parse(jsonStr)
      // sort: known recipes first
      parsed.sort((a, b) => (a.source === 'known' ? 0 : 1) - (b.source === 'known' ? 0 : 1))
      setRecipes(parsed)
      setStep('recipes')
    } catch (e: any) {
      setError(e.message || 'Failed to generate recipes')
    } finally {
      setLoading(false)
    }
  }, [ingredients])

  const reset = useCallback(() => {
    setStep('capture')
    setImageData(null)
    setIngredients([])
    setExtraInput('')
    setRecipes([])
    setError('')
    stopCamera()
  }, [stopCamera])

  const selectedCount = ingredients.filter(i => i.checked).length

  return (
    <div className="pantry">
      <div className="pantry__header">
        <a href="#/" className="post-back">&larr; back</a>
        <h1 className="pantry__title">Pantry Scanner</h1>
        <p className="pantry__subtitle">Snap a photo of your fridge or pantry and get recipe ideas</p>
      </div>

      {error && <div className="pantry__error">{error}</div>}

      {/* STEP 1: Capture */}
      {step === 'capture' && (
        <div className="pantry__capture">
          {cameraActive && !imageData && (
            <div className="pantry__camera">
              <video ref={videoRef} className="pantry__video" autoPlay playsInline muted />
              <button className="btn pantry__shutter" onClick={capturePhoto}>Take Photo</button>
            </div>
          )}

          {imageData && (
            <div className="pantry__preview">
              <img src={imageData} alt="Your food" className="pantry__preview-img" />
              <div className="pantry__preview-actions">
                <button className="btn" onClick={() => { setImageData(null); setError('') }}>Retake</button>
                <button className="btn pantry__btn--primary" onClick={identifyIngredients} disabled={loading}>
                  {loading ? 'Scanning…' : 'Find Ingredients'}
                </button>
              </div>
            </div>
          )}

          {!cameraActive && !imageData && (
            <div className="pantry__start">
              <div className="pantry__dropzone" onClick={() => fileRef.current?.click()}>
                <div className="pantry__dropzone-icon">📷</div>
                <p>Tap to upload a photo</p>
                <p className="pantry__dropzone-hint">or use the camera below</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <button className="btn pantry__btn--primary pantry__camera-btn" onClick={startCamera}>
                Open Camera
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Review ingredients */}
      {step === 'ingredients' && (
        <div className="pantry__ingredients">
          {imageData && <img src={imageData} alt="Your food" className="pantry__thumb" />}

          <div className="pantry__checklist-header">
            <span className="pantry__label">We found {ingredients.length} items</span>
            <span className="pantry__label-muted">{selectedCount} selected</span>
          </div>

          <div className="pantry__checklist">
            {ingredients.map((item, i) => (
              <label key={i} className={`pantry__check-item${item.checked ? '' : ' pantry__check-item--off'}`}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleIngredient(i)}
                  className="pantry__checkbox"
                />
                <span className="pantry__check-name">{item.name}</span>
                <button className="pantry__check-remove" onClick={e => { e.preventDefault(); removeIngredient(i) }} title="Remove">×</button>
              </label>
            ))}
          </div>

          <div className="pantry__add-extra">
            <p className="pantry__add-label">Have anything else not in the picture?</p>
            <div className="pantry__add-row">
              <input
                type="text"
                className="pantry__add-input"
                placeholder="e.g. rice, lemon, soy sauce"
                value={extraInput}
                onChange={e => setExtraInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addExtra()}
              />
              <button className="btn" onClick={addExtra} disabled={!extraInput.trim()}>Add</button>
            </div>
          </div>

          <div className="pantry__ingredient-actions">
            <button className="btn" onClick={reset}>Start Over</button>
            <button className="btn pantry__btn--primary" onClick={generateRecipes} disabled={loading || selectedCount === 0}>
              {loading ? 'Cooking up ideas…' : `Get Recipes (${selectedCount})`}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Recipes */}
      {step === 'recipes' && (
        <div className="pantry__recipes">
          <div className="pantry__recipes-header">
            <h2>Recipes for You</h2>
            <p className="pantry__recipes-from">Based on: {ingredients.filter(i => i.checked).map(i => i.name).join(', ')}</p>
          </div>
          <div className="pantry__recipe-list">
            {recipes.map((r, i) => (
              <details key={i} className="pantry__recipe card" open={i === 0}>
                <summary className="pantry__recipe-summary">
                  <div className="pantry__recipe-title-row">
                    {r.source === 'known'
                      ? <span className="pantry__badge pantry__badge--known">Top Rated</span>
                      : <span className="pantry__badge pantry__badge--custom">AI Recipe</span>
                    }
                    <span className="pantry__recipe-name">{r.name}</span>
                  </div>
                  <div className="pantry__recipe-meta">
                    {r.rating && <span className="pantry__recipe-rating"><Stars rating={r.rating} /> {r.rating}</span>}
                    {r.origin && <span className="pantry__recipe-origin">{r.origin}</span>}
                    <span className="pantry__recipe-time">{r.time}</span>
                  </div>
                </summary>
                <div className="pantry__recipe-body">
                  <p className="pantry__recipe-desc">{r.description}</p>

                  <div className="pantry__macros">
                    <div className="pantry__macro">
                      <span className="pantry__macro-val">{r.macros.calories}</span>
                      <span className="pantry__macro-label">cal</span>
                    </div>
                    <div className="pantry__macro">
                      <span className="pantry__macro-val">{r.macros.protein}</span>
                      <span className="pantry__macro-label">protein</span>
                    </div>
                    <div className="pantry__macro">
                      <span className="pantry__macro-val">{r.macros.carbs}</span>
                      <span className="pantry__macro-label">carbs</span>
                    </div>
                    <div className="pantry__macro">
                      <span className="pantry__macro-val">{r.macros.fat}</span>
                      <span className="pantry__macro-label">fat</span>
                    </div>
                    <div className="pantry__macro">
                      <span className="pantry__macro-val">{r.macros.fiber}</span>
                      <span className="pantry__macro-label">fiber</span>
                    </div>
                  </div>

                  <h4>Ingredients</h4>
                  <ul className="pantry__recipe-ingredients">
                    {r.ingredients.map((ing, j) => <li key={j}>{ing}</li>)}
                  </ul>
                  <h4>Steps</h4>
                  <ol className="pantry__recipe-steps">
                    {r.steps.map((s, j) => <li key={j}>{s}</li>)}
                  </ol>
                </div>
              </details>
            ))}
          </div>
          <div className="pantry__recipe-actions">
            <button className="btn" onClick={() => setStep('ingredients')}>Back to Ingredients</button>
            <button className="btn" onClick={reset}>Scan Again</button>
          </div>
        </div>
      )}
    </div>
  )
}
