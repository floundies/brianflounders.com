import * as React from 'react'

const { useState, useRef, useCallback } = React

type Step = 'capture' | 'ingredients' | 'recipes'

interface Recipe {
  name: string
  time: string
  description: string
  ingredients: string[]
  steps: string[]
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

export default function PantryScanner() {
  const [step, setStep] = useState<Step>('capture')
  const [imageData, setImageData] = useState<string | null>(null)
  const [ingredients, setIngredients] = useState<string[]>([])
  const [editValue, setEditValue] = useState('')
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
      const items = text.split('\n').map((s: string) => s.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean)
      setIngredients(items)
      setEditValue(items.join('\n'))
      setStep('ingredients')
    } catch (e: any) {
      setError(e.message || 'Failed to identify ingredients')
    } finally {
      setLoading(false)
    }
  }, [imageData])

  const generateRecipes = useCallback(async () => {
    const items = editValue.split('\n').map(s => s.trim()).filter(Boolean)
    if (items.length === 0) return
    setIngredients(items)
    setLoading(true)
    setError('')
    try {
      const text = await callGemini({
        contents: [{
          parts: [{
            text: `I have these ingredients:\n${items.join('\n')}\n\nSuggest 3 recipes I can make using primarily these ingredients (it's okay to assume common pantry staples like salt, pepper, oil, butter, garlic). For each recipe respond in this exact JSON format (no markdown fences):\n[{"name":"...","time":"...","description":"one sentence","ingredients":["..."],"steps":["..."]}]`,
          }],
        }],
        generationConfig: { temperature: 0.7 },
      })
      // extract JSON from response
      const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(jsonStr)
      setRecipes(parsed)
      setStep('recipes')
    } catch (e: any) {
      setError(e.message || 'Failed to generate recipes')
    } finally {
      setLoading(false)
    }
  }, [editValue])

  const reset = useCallback(() => {
    setStep('capture')
    setImageData(null)
    setIngredients([])
    setEditValue('')
    setRecipes([])
    setError('')
    stopCamera()
  }, [stopCamera])

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
          <label className="pantry__label">Edit your ingredients (one per line):</label>
          <textarea
            className="pantry__textarea"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            rows={Math.max(6, ingredients.length + 2)}
          />
          <div className="pantry__ingredient-actions">
            <button className="btn" onClick={reset}>Start Over</button>
            <button className="btn pantry__btn--primary" onClick={generateRecipes} disabled={loading}>
              {loading ? 'Cooking up ideas…' : 'Get Recipes'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Recipes */}
      {step === 'recipes' && (
        <div className="pantry__recipes">
          <div className="pantry__recipes-header">
            <h2>Recipes for You</h2>
            <p className="pantry__recipes-from">Based on: {ingredients.join(', ')}</p>
          </div>
          <div className="pantry__recipe-list">
            {recipes.map((r, i) => (
              <details key={i} className="pantry__recipe card">
                <summary className="pantry__recipe-summary">
                  <span className="pantry__recipe-name">{r.name}</span>
                  <span className="pantry__recipe-time">{r.time}</span>
                </summary>
                <p className="pantry__recipe-desc">{r.description}</p>
                <h4>Ingredients</h4>
                <ul className="pantry__recipe-ingredients">
                  {r.ingredients.map((ing, j) => <li key={j}>{ing}</li>)}
                </ul>
                <h4>Steps</h4>
                <ol className="pantry__recipe-steps">
                  {r.steps.map((s, j) => <li key={j}>{s}</li>)}
                </ol>
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
