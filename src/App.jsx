import { useState, useRef, useCallback } from 'react'

/* ─────────────────────────────────────────────
   Utility: read a File → JSON
───────────────────────────────────────────── */
function readFileAsJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        resolve(JSON.parse(e.target.result))
      } catch {
        reject(new Error(`"${file.name}" is not valid JSON`))
      }
    }
    reader.onerror = () => reject(new Error(`Could not read "${file.name}"`))
    reader.readAsText(file)
  })
}

/* ─────────────────────────────────────────────
   File Drop Zone component
───────────────────────────────────────────── */
function FileDropZone({ label, sublabel, icon, file, onFile, onError, accept = '.json' }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const handleFile = useCallback(async (f) => {
    if (!f) return
    if (!f.name.endsWith('.json') && f.type !== 'application/json') {
      onError(`"${f.name}" is not a JSON file`)
      return
    }
    try {
      const parsed = await readFileAsJSON(f)
      onFile({ name: f.name, parsed })
    } catch (err) {
      onError(err.message)
    }
  }, [onFile, onError])

  return (
    <div className="file-zone-wrapper">
      <div className="file-zone-label">
        <span className="file-zone-icon">{icon}</span>
        <div>
          <div className="file-zone-title">{label}</div>
          <div className="file-zone-sub">{sublabel}</div>
        </div>
      </div>

      <div
        className={`file-zone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFile(e.dataTransfer.files[0])
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])}
        />
        {file ? (
          <div className="file-info">
            <span className="file-check">✓</span>
            <span className="file-name">{file.name}</span>
            <button
              className="file-clear"
              onClick={(e) => { e.stopPropagation(); onFile(null) }}
            >×</button>
          </div>
        ) : (
          <div className="file-placeholder">
            <div className="drop-icon">⬆</div>
            <div className="drop-text">Drop file here or <span className="drop-link">browse</span></div>
            <div className="drop-hint">JSON format only</div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Results Table component
───────────────────────────────────────────── */
function ResultsTable({ validations }) {
  if (!validations || validations.length === 0) {
    return (
      <div className="empty-results">
        <div className="empty-icon">◎</div>
        <div className="empty-text">No validation results returned</div>
      </div>
    )
  }

  // Collect all unique column keys across all rows
  const allKeys = Array.from(
    new Set(validations.flatMap(row => Object.keys(row)))
  )

  const formatCell = (val) => {
    if (val === null || val === undefined) return <span className="cell-null">—</span>
    if (typeof val === 'boolean') return (
      <span className={`cell-bool ${val ? 'cell-true' : 'cell-false'}`}>
        {val ? '✓ true' : '✗ false'}
      </span>
    )
    if (typeof val === 'object') return (
      <span className="cell-json">{JSON.stringify(val)}</span>
    )
    if (typeof val === 'number') return <span className="cell-number">{val}</span>
    const s = String(val)
    // Detect pass/fail/error keywords
    const lower = s.toLowerCase()
    if (['pass', 'passed', 'valid', 'ok', 'success', 'true'].includes(lower))
      return <span className="cell-pass">{s}</span>
    if (['fail', 'failed', 'invalid', 'error', 'false', 'rejected'].includes(lower))
      return <span className="cell-fail">{s}</span>
    if (['warn', 'warning', 'caution', 'review'].includes(lower))
      return <span className="cell-warn">{s}</span>
    return <span>{s}</span>
  }

  return (
    <div className="table-scroll">
      <table className="results-table">
        <thead>
          <tr>
            <th className="row-num">#</th>
            {allKeys.map(k => <th key={k}>{k}</th>)}
          </tr>
        </thead>
        <tbody>
          {validations.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
              <td className="row-num">{i + 1}</td>
              {allKeys.map(k => (
                <td key={k}>{formatCell(row[k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Main App
───────────────────────────────────────────── */
export default function App() {
  const [dataFile, setDataFile]       = useState(null)
  const [rulesetFile, setRulesetFile] = useState(null)
  const [apiUrl, setApiUrl]           = useState('http://localhost:8080/api/validate')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [result, setResult]           = useState(null)
  const [rawResult, setRawResult]     = useState(null)
  const [showRaw, setShowRaw]         = useState(false)
  const [fileError, setFileError]     = useState(null)

  const canSubmit = dataFile && rulesetFile && apiUrl.trim() && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    setResult(null)
    setRawResult(null)

    try {
      const body = JSON.stringify({
        data: dataFile.parsed,
        ruleset: rulesetFile.parsed,
      })

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      const text = await res.text()
      let json
      try {
        json = JSON.parse(text)
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${res.status}):\n${text.slice(0, 300)}`)
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${json?.message || json?.error || res.statusText}`)
      }

      setRawResult(json)

      // Extract validations array — support various response shapes:
      // { validations: [...] }  /  { result: { validations: [...] } }  /  [...] directly
      const validations =
        Array.isArray(json)                         ? json :
        Array.isArray(json.validations)             ? json.validations :
        Array.isArray(json.result?.validations)     ? json.result.validations :
        Array.isArray(json.result)                  ? json.result :
        Array.isArray(json.data)                    ? json.data :
        null

      if (!validations) {
        throw new Error('Response does not contain a recognisable "validations" array.\nReceived: ' + JSON.stringify(json, null, 2).slice(0, 400))
      }

      setResult(validations)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* ── Header ── */}
        <header className="header">
          <div className="header-inner">
            <div className="logo">
              <div className="logo-mark">
                <span>G</span><span>R</span>
              </div>
              <div>
                <div className="logo-title">GoRules Validator</div>
                <div className="logo-sub">Decision Engine · REST Client</div>
              </div>
            </div>
          </div>
        </header>

        <main className="main">
          {/* ── Config Panel ── */}
          <section className="panel config-panel">
            <div className="panel-header">
              <span className="panel-num">01</span>
              <div>
                <div className="panel-title">Configure</div>
                <div className="panel-desc">Set API endpoint and upload your JSON files</div>
              </div>
            </div>

            {/* API URL */}
            <div className="field-group">
              <label className="field-label">
                <span className="label-icon">⊹</span> API Endpoint
              </label>
              <input
                className="field-input"
                type="url"
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder="http://localhost:8080/api/validate"
                spellCheck={false}
              />
              <div className="field-hint">
                POST body: <code>{"{ \"data\": {...}, \"ruleset\": {...} }"}</code>
              </div>
            </div>

            {/* File uploads */}
            {fileError && (
              <div className="file-error">{fileError}</div>
            )}
            <div className="file-row">
              <FileDropZone
                label="Input Data"
                sublabel="data field payload"
                icon="◈"
                file={dataFile}
                onFile={(f) => { setDataFile(f); setFileError(null) }}
                onError={setFileError}
              />
              <FileDropZone
                label="Ruleset"
                sublabel="GoRules decision graph"
                icon="◇"
                file={rulesetFile}
                onFile={(f) => { setRulesetFile(f); setFileError(null) }}
                onError={setFileError}
              />
            </div>

            {/* Submit */}
            <button
              className={`submit-btn ${loading ? 'loading' : ''}`}
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {loading ? (
                <><span className="spinner" /> Evaluating…</>
              ) : (
                <><span className="btn-icon">▶</span> Run Evaluation</>
              )}
            </button>
          </section>

          {/* ── Results Panel ── */}
          {(result || error) && (
            <section className="panel results-panel">
              <div className="panel-header">
                <span className="panel-num">02</span>
                <div>
                  <div className="panel-title">Results</div>
                  <div className="panel-desc">
                    {result
                      ? `${result.length} validation record${result.length !== 1 ? 's' : ''} returned`
                      : 'Evaluation failed'}
                  </div>
                </div>
                {result && (
                  <div className="results-actions">
                    <button
                      className={`toggle-btn ${showRaw ? 'active' : ''}`}
                      onClick={() => setShowRaw(v => !v)}
                    >
                      {showRaw ? '⊞ Table' : '{ } Raw JSON'}
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div className="error-box">
                  <div className="error-title">⚠ Error</div>
                  <pre className="error-body">{error}</pre>
                </div>
              )}

              {result && !showRaw && <ResultsTable validations={result} />}

              {result && showRaw && (
                <pre className="raw-json">{JSON.stringify(rawResult, null, 2)}</pre>
              )}
            </section>
          )}

          {/* ── Idle state ── */}
          {!result && !error && (
            <div className="idle-hint">
              <div className="idle-grid">
                <div className="idle-card">
                  <div className="idle-card-num">POST</div>
                  <div className="idle-card-text">Sends <code>data</code> + <code>ruleset</code> as JSON body</div>
                </div>
                <div className="idle-card">
                  <div className="idle-card-num">⇄</div>
                  <div className="idle-card-text">Expects <code>{"{ validations: [...] }"}</code> in response</div>
                </div>
                <div className="idle-card">
                  <div className="idle-card-num">⊞</div>
                  <div className="idle-card-text">Dynamic columns — any fields in the array are rendered</div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  )
}

/* ─────────────────────────────────────────────
   CSS-in-JS (single file for portability)
───────────────────────────────────────────── */
const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #f5f4f0;
    --surface:   #ffffff;
    --border:    #e2e0d8;
    --border2:   #ccc9be;
    --ink:       #1a1916;
    --ink2:      #6b6860;
    --ink3:      #9e9b94;
    --accent:    #1a1916;
    --accent-fg: #f5f4f0;
    --green:     #1a6b4a;
    --red:       #b83030;
    --amber:     #a05a10;
    --blue:      #1a3a7a;
    --radius:    8px;
    --font:      'Outfit', sans-serif;
    --mono:      'Fira Code', monospace;
    --shadow:    0 2px 8px rgba(0,0,0,.07), 0 0 0 1px rgba(0,0,0,.04);
  }

  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--ink);
    min-height: 100vh;
    font-size: 14px;
    line-height: 1.55;
  }

  code {
    font-family: var(--mono);
    font-size: 12px;
    background: rgba(0,0,0,.06);
    padding: 1px 5px;
    border-radius: 4px;
  }

  /* ── Header ── */
  .header {
    background: var(--ink);
    color: var(--accent-fg);
    border-bottom: 1px solid #333;
  }
  .header-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 16px 28px;
  }
  .logo { display: flex; align-items: center; gap: 14px; }
  .logo-mark {
    width: 42px; height: 42px;
    border: 2px solid #fff;
    display: grid;
    grid-template-columns: 1fr 1fr;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0;
    overflow: hidden;
    border-radius: 6px;
  }
  .logo-mark span {
    display: flex; align-items: center; justify-content: center;
    height: 100%;
  }
  .logo-mark span:first-child { background: #fff; color: #000; }
  .logo-mark span:last-child  { background: #000; color: #fff; border: 1px solid #555; }
  .logo-title { font-size: 17px; font-weight: 700; letter-spacing: -.01em; }
  .logo-sub   { font-size: 11px; color: #888; letter-spacing: .06em; text-transform: uppercase; margin-top: 1px; }

  /* ── Main ── */
  .main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 32px 28px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* ── Panel ── */
  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .panel-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 22px 28px;
    border-bottom: 1px solid var(--border);
    background: #faf9f6;
  }
  .panel-num {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink3);
    background: var(--border);
    padding: 3px 7px;
    border-radius: 4px;
    margin-top: 3px;
    flex-shrink: 0;
  }
  .panel-title { font-size: 16px; font-weight: 700; letter-spacing: -.01em; }
  .panel-desc  { font-size: 12px; color: var(--ink2); margin-top: 2px; }

  /* ── Config panel body ── */
  .config-panel .field-group { padding: 22px 28px 0; }
  .config-panel .file-row    { padding: 22px 28px 0; }
  .config-panel .submit-btn  { margin: 22px 28px 28px; }

  .field-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .06em;
    color: var(--ink2); margin-bottom: 8px;
  }
  .label-icon { font-size: 14px; }
  .field-input {
    width: 100%;
    padding: 10px 14px;
    border: 1.5px solid var(--border2);
    border-radius: var(--radius);
    font-family: var(--mono);
    font-size: 13px;
    background: var(--bg);
    color: var(--ink);
    transition: border-color .15s;
    outline: none;
  }
  .field-input:focus { border-color: var(--ink); }
  .field-hint { font-size: 11px; color: var(--ink3); margin-top: 6px; }

  /* ── File row ── */
  .file-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media(max-width:640px) { .file-row { grid-template-columns: 1fr; } }

  .file-zone-wrapper {}
  .file-zone-label {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 8px;
  }
  .file-zone-icon { font-size: 18px; }
  .file-zone-title { font-size: 13px; font-weight: 600; }
  .file-zone-sub   { font-size: 11px; color: var(--ink3); }

  .file-zone {
    border: 2px dashed var(--border2);
    border-radius: var(--radius);
    padding: 20px;
    cursor: pointer;
    transition: border-color .15s, background .15s;
    background: var(--bg);
    min-height: 100px;
    display: flex; align-items: center; justify-content: center;
  }
  .file-zone:hover  { border-color: var(--ink2); background: #efede8; }
  .file-zone.dragging { border-color: var(--ink); background: #eae8e3; }
  .file-zone.has-file { border-style: solid; border-color: var(--ink); background: #f0ede6; }

  .file-info {
    display: flex; align-items: center; gap: 10px; width: 100%;
  }
  .file-check { color: var(--green); font-size: 16px; flex-shrink: 0; }
  .file-name  { font-family: var(--mono); font-size: 12px; flex: 1; word-break: break-all; }
  .file-clear {
    background: none; border: 1px solid var(--border2); border-radius: 4px;
    width: 22px; height: 22px; cursor: pointer;
    font-size: 15px; color: var(--ink2); display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; line-height: 1;
    transition: background .1s;
  }
  .file-clear:hover { background: var(--border); }

  .file-placeholder { text-align: center; }
  .drop-icon  { font-size: 24px; margin-bottom: 6px; color: var(--ink2); }
  .drop-text  { font-size: 13px; color: var(--ink2); }
  .drop-link  { text-decoration: underline; text-underline-offset: 2px; color: var(--ink); }
  .drop-hint  { font-size: 11px; color: var(--ink3); margin-top: 4px; }

  .file-error {
    margin: 12px 28px 0;
    padding: 10px 14px;
    background: #fff5f5;
    border: 1px solid #fac5c5;
    border-radius: var(--radius);
    font-size: 12px; color: var(--red);
  }

  /* ── Submit ── */
  .submit-btn {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 24px;
    background: var(--ink);
    color: var(--accent-fg);
    border: none; border-radius: var(--radius);
    font-family: var(--font); font-size: 14px; font-weight: 600;
    cursor: pointer; transition: opacity .15s, transform .1s;
    letter-spacing: .01em;
  }
  .submit-btn:hover:not(:disabled) { opacity: .85; }
  .submit-btn:active:not(:disabled) { transform: scale(.98); }
  .submit-btn:disabled { opacity: .4; cursor: not-allowed; }
  .submit-btn.loading { opacity: .7; cursor: wait; }
  .btn-icon { font-size: 12px; }

  .spinner {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin .7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Results panel ── */
  .results-panel .panel-header { flex-wrap: wrap; }
  .results-actions { margin-left: auto; }
  .toggle-btn {
    padding: 7px 14px;
    border: 1.5px solid var(--border2);
    border-radius: 6px;
    background: var(--surface);
    font-family: var(--font); font-size: 12px; font-weight: 600;
    cursor: pointer; color: var(--ink2);
    transition: background .12s, border-color .12s;
  }
  .toggle-btn:hover, .toggle-btn.active {
    background: var(--ink); color: var(--accent-fg); border-color: var(--ink);
  }

  /* ── Table ── */
  .table-scroll { overflow-x: auto; padding: 0; }
  .results-table {
    width: 100%; border-collapse: collapse;
    font-size: 13px; min-width: 400px;
  }
  .results-table thead th {
    text-align: left;
    padding: 11px 16px;
    font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .07em;
    color: var(--ink2);
    background: #faf9f6;
    border-bottom: 1.5px solid var(--border);
    white-space: nowrap;
    position: sticky; top: 0;
  }
  .results-table tbody td {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--ink);
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-even td { background: var(--surface); }
  .row-odd  td { background: #faf9f6; }
  .results-table tbody tr:hover td { background: #f0ede6; }
  .row-num {
    color: var(--ink3) !important;
    font-size: 11px !important;
    width: 36px;
    text-align: center !important;
    user-select: none;
  }

  .cell-null   { color: var(--ink3); font-style: italic; }
  .cell-bool   { font-weight: 600; }
  .cell-true   { color: var(--green); }
  .cell-false  { color: var(--red); }
  .cell-number { color: var(--blue); }
  .cell-json   { color: var(--ink2); }
  .cell-pass   { color: var(--green); font-weight: 600; }
  .cell-fail   { color: var(--red);   font-weight: 600; }
  .cell-warn   { color: var(--amber); font-weight: 600; }

  /* ── Empty / Error ── */
  .empty-results {
    padding: 60px 28px;
    text-align: center;
  }
  .empty-icon { font-size: 32px; color: var(--ink3); margin-bottom: 10px; }
  .empty-text { font-size: 14px; color: var(--ink2); }

  .error-box {
    margin: 20px 28px;
    padding: 16px 18px;
    background: #fff8f8;
    border: 1px solid #f0c0c0;
    border-radius: var(--radius);
  }
  .error-title { font-weight: 700; color: var(--red); margin-bottom: 8px; font-size: 13px; }
  .error-body  {
    font-family: var(--mono); font-size: 12px; color: #7a2020;
    white-space: pre-wrap; word-break: break-word; margin: 0;
  }

  .raw-json {
    margin: 20px 28px 28px;
    padding: 16px;
    background: #f5f4f0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--mono);
    font-size: 12px;
    color: var(--ink);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 480px;
    overflow-y: auto;
  }

  /* ── Idle hint ── */
  .idle-hint { padding: 8px 0; }
  .idle-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
  @media(max-width:640px) { .idle-grid { grid-template-columns: 1fr; } }
  .idle-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px 20px;
    box-shadow: var(--shadow);
  }
  .idle-card-num {
    font-family: var(--mono);
    font-size: 12px; font-weight: 600;
    color: var(--ink2);
    text-transform: uppercase; letter-spacing: .05em;
    margin-bottom: 6px;
  }
  .idle-card-text { font-size: 13px; color: var(--ink2); line-height: 1.5; }
`
