import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_BASE, DEFAULT_MODEL, FLAG_DEFS, INVITE_URL, PALETTE, SAMPLES, guideFor, makeNode, nodeFromSpec } from './catalog.js';
import { chipLabel, compile, explain, parsePattern, testPattern } from './engine.js';
import { MarkdownView } from './MarkdownView.jsx';
import { AI_TASKS, buildAiContext } from './ai-context.js';


function decodeDataUrl(url) {
  const comma = url.indexOf(',');
  if (comma < 0) return '';
  try {
    const binary = atob(url.slice(comma + 1));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export default function App() {
  const [nodes, setNodes] = useState(() => parsePattern(SAMPLES.find((sample) => sample.name === '日期').pattern));
  const [flags, setFlags] = useState('mu');
  const [selected, setSelected] = useState(null);
  const [text, setText] = useState('2026-11-01\n2026-13-40\n1999-02-28');
  const [patternDraft, setPatternDraft] = useState(null);
  const [dropAt, setDropAt] = useState(null);
  const [history, setHistory] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const [aiTask, setAiTask] = useState('explain');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiOutput, setAiOutput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [copied, setCopied] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [hoverItem, setHoverItem] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('rvb-theme') || 'dark');
  const [cases, setCases] = useState([
    { id: 'c1', input: '2026-11-01', should: true },
    { id: 'c2', input: '2026-13-40', should: false },
    { id: 'c3', input: '1999-02-28', should: true },
  ]);
  const streamId = useRef('');
  const fileRef = useRef(null);

  const compiled = useMemo(() => compile(nodes), [nodes]);
  const pattern = patternDraft ?? compiled.source;
  const result = useMemo(() => testPattern(pattern, flags, text), [pattern, flags, text]);
  const multilineWouldMatch = useMemo(() => {
    if (!pattern || !text.includes('\n') || flags.includes('m') || !result.ok || result.matches.length) return false;
    return testPattern(pattern, `${flags}m`, text).matches.length > 0;
  }, [pattern, flags, text, result]);
  const selectedNode = nodes.find((n) => n.id === selected) || null;

  useEffect(() => {
    window.desk?.getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('rvb-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!window.desk?.onAi) return undefined;
    return window.desk.onAi((message) => {
      if (message.id !== streamId.current) return;
      if (message.type === 'delta') setAiOutput((prev) => prev + message.delta);
      if (message.type === 'done') setAiBusy(false);
      if (message.type === 'error') {
        setAiError(message.error);
        setAiBusy(false);
      }
    });
  }, []);

  function commit(next) {
    setHistory((h) => [...h.slice(-40), nodes]);
    setNodes(next);
    setPatternDraft(null);
  }

  function undo() {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (prev) {
        setNodes(prev);
        setPatternDraft(null);
      }
      return h.slice(0, -1);
    });
  }

  function onPaletteDrag(event, item) {
    setHoverItem(item);
    event.dataTransfer.setData('application/x-regex-new', JSON.stringify(item));
    event.dataTransfer.effectAllowed = 'copy';
  }

  function onChipDrag(event, id) {
    event.dataTransfer.setData('application/x-regex-move', id);
    event.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(event, index) {
    event.preventDefault();
    setDropAt(null);
    const moved = event.dataTransfer.getData('application/x-regex-move');
    const created = event.dataTransfer.getData('application/x-regex-new');
    if (moved) {
      const from = nodes.findIndex((n) => n.id === moved);
      if (from < 0) return;
      const copy = nodes.slice();
      const [item] = copy.splice(from, 1);
      const target = from < index ? index - 1 : index;
      copy.splice(target, 0, item);
      commit(copy);
      return;
    }
    if (created) {
      const item = JSON.parse(created);
      const copy = nodes.slice();
      copy.splice(index, 0, makeNode(item));
      commit(copy);
    }
  }

  function updateSelected(patch) {
    commit(nodes.map((n) => (n.id === selected ? { ...n, ...patch } : n)));
    setSelected(selected);
  }

  function removeSelected() {
    if (!selected) return;
    commit(nodes.filter((n) => n.id !== selected));
    setSelected(null);
  }

  function applyPatternText(value) {
    setPatternDraft(value);
    commit(parsePattern(value));
    setPatternDraft(value);
  }

  function loadSample(sample) {
    commit(parsePattern(sample.pattern));
    setFlags(sample.flags);
    setText(sample.sample);
  }

  function toggleFlag(id) {
    setFlags((prev) => (prev.includes(id) ? prev.replace(id, '') : prev + id));
  }

  function addAttachmentFiles(fileList) {
    const incoming = [...fileList].slice(0, 5 - attachments.length);
    if (!incoming.length) {
      setAiError('最多 5 个附件');
      return;
    }
    incoming.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || '');
        setAttachments((prev) => {
          if (prev.length >= 5) return prev;
          return [...prev, { id: `${file.name}-${Date.now()}`, name: file.name, type: file.type, url }];
        });
      };
      if (file.type.startsWith('image/') || file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.json')) {
        reader.readAsDataURL(file);
      } else {
        setAiError(`暂不读取 ${file.name}`);
      }
    });
  }

  function runAi() {
    let context;
    try {
      context = buildAiContext({ taskId: aiTask, pattern, flags, cases, text, error: result.error, prompt: aiPrompt });
    } catch (err) { setAiError(err.message); return; }
    setAiBusy(true);
    setAiError('');
    setAiOutput('');
    setCopied(false);
    const content = [
      {
        type: 'text',
        text: context,
      },
    ];
    attachments.forEach((file) => {
      if (file.type.startsWith('image/')) content.push({ type: 'image_url', image_url: { url: file.url } });
      else content.push({ type: 'text', text: `附件 ${file.name}:\n${decodeDataUrl(file.url).slice(0, 8000)}` });
    });
    streamId.current = window.desk.streamChat({
      model: settings?.activeModel,
      messages: [
        {
          role: 'system',
          content: '你是可视化正则编辑器的助手。先用 Markdown 回答，公式使用 $...$ 或 $$...$$。文末单独给一个 ```json 代码块，字段：flags、warnings、tests（[{"s":"文本","should":true}]）、blocks、可选 pattern。blocks 每项含 kind，以及需要的 value/source/body/negated/prop/ref/name/preset/min/max/lazy/mode。kind 只能是 text,any,raw,digit,nonDigit,word,nonWord,space,nonSpace,class,unicode,anchorStart,anchorEnd,wordBoundary,nonWordBoundary,quant,groupOpen,groupClose,backref,alt。quant 的 preset 为 *、+、? 或 range。groupOpen 的 mode 为 capture,noncap,named,ahead,aheadNot,behind,behindNot。生成表达式时 blocks 必须能拼成积木。',
        },
        { role: 'user', content },
      ],
    });
  }

  function blocksFromReply(data, output) {
    if (Array.isArray(data?.blocks) && data.blocks.length) {
      const next = data.blocks.map(nodeFromSpec).filter(Boolean);
      if (next.length) return next;
    }
    if (typeof data?.pattern === 'string' && data.pattern) return parsePattern(data.pattern);
    const inline = output.match(/`\/((?:\\\/|[^`\n])+)\/([gimsuyvd]*)`/);
    if (inline) return parsePattern(inline[1]);
    return null;
  }

  function sendToCanvas() {
    const data = extractJson(aiOutput);
    const next = blocksFromReply(data, aiOutput);
    if (!next?.length) {
      setAiError('回复里还没有可送到画布的积木或表达式');
      return;
    }
    commit(next);
    const flagSource = typeof data?.flags === 'string'
      ? data.flags
      : (aiOutput.match(/`\/(?:\\\/|[^`\n])+\/([gimsuyvd]*)`/)?.[1] || '');
    if (flagSource) setFlags(flagSource.replace(/[^gimsuyvd]/g, ''));
    setAiError('');
  }

  function applyTests() {
    const data = extractJson(aiOutput);
    if (!Array.isArray(data?.tests) || !data.tests.length) {
      setAiError('回复里还没有测试用例');
      return;
    }
    setCases(data.tests.map((item, index) => ({
      id: `ai${index}-${Date.now()}`,
      input: String(item.s ?? ''),
      should: Boolean(item.should),
    })));
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(aiOutput);
    setCopied(true);
  }

  const aiData = aiOutput ? extractJson(aiOutput) : null;
  const canvasDraft = aiOutput && !aiBusy ? blocksFromReply(aiData, aiOutput) : null;
  const canvasPreview = canvasDraft ? compile(canvasDraft).source : '';
  const guide = hoverItem || (selectedNode ? guideFor(selectedNode) : null);
  const caseResults = cases.map((item) => {
    const run = testPattern(pattern, flags, item.input);
    const matched = run.ok && run.matches.length > 0;
    return { ...item, matched, pass: run.ok && matched === item.should, error: run.error };
  });
  const passed = caseResults.filter((item) => item.pass).length;

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="mark">Reg Visual Builder</p>
          <h1>正则排版台</h1>
        </div>
        <code className="live">/{pattern || '空'}/{flags}</code>
        <div className="top-actions">
          <button type="button" onClick={undo} disabled={!history.length}>撤销</button>
          <button type="button" onClick={() => commit([])}>清空</button>
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '明亮' : '暗黑'}</button>
          <button type="button" className="primary" onClick={() => setSettingsOpen(true)}>设置</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="palette">
          {PALETTE.map((group) => (
            <section key={group.group}>
              <h2>{group.group}</h2>
              <div className="chips">
                {group.items.map((item) => (
                  <button
                    key={`${group.group}-${item.label}`}
                    type="button"
                    draggable
                    onMouseEnter={() => setHoverItem(item)}
                    onDragStart={(e) => onPaletteDrag(e, item)}
                    onClick={() => commit([...nodes, makeNode(item)])}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
          <section>
            <h2>示例</h2>
            <div className="chips">
              {SAMPLES.map((sample) => (
                <button key={sample.name} type="button" onClick={() => loadSample(sample)}>{sample.name}</button>
              ))}
            </div>
          </section>
        </aside>

        <main className="canvas">
          <div
            className="rail"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, nodes.length)}
          >
            {nodes.length === 0 && <p className="empty">把左侧积木拖到这里。点击积木也会追加到末尾。</p>}
            {nodes.map((node, index) => (
              <span key={node.id} className="slot">
                <i
                  className={dropAt === index ? 'gap on' : 'gap'}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDropAt(index);
                  }}
                  onDrop={(e) => {
                    e.stopPropagation();
                    onDrop(e, index);
                  }}
                />
                <button
                  type="button"
                  draggable
                  className={selected === node.id ? 'token on' : 'token'}
                  onDragStart={(e) => onChipDrag(e, node.id)}
                  onClick={() => setSelected(node.id)}
                >
                  {chipLabel(node)}
                </button>
              </span>
            ))}
          </div>
          {compiled.errors.length > 0 && (
            <ul className="errors">
              {compiled.errors.map((err) => <li key={`${err.index}-${err.message}`}>{err.message}</li>)}
            </ul>
          )}
          <label className="source">
            表达式源码
            <input
              value={pattern}
              spellCheck={false}
              onChange={(e) => {
                setPatternDraft(e.target.value);
              }}
              onBlur={() => patternDraft != null && applyPatternText(patternDraft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyPatternText(pattern);
              }}
            />
          </label>
          <p className="hint">直接改源码后按 Enter，或点到别处，会重新拆成积木。字面量积木里的特殊字符在拼装时会转义。</p>
          <section className="cases">
            <div className="ai-bar">
              <h2>测试用例 {passed}/{caseResults.length}</h2>
              <button type="button" onClick={() => setCases([...cases, { id: `n${Date.now()}`, input: '', should: true }])}>增加用例</button>
            </div>
            {caseResults.map((item) => (
              <div key={item.id} className={item.pass ? 'case ok' : 'case bad'}>
                <input
                  value={item.input}
                  onChange={(e) => setCases(cases.map((row) => (row.id === item.id ? { ...row, input: e.target.value } : row)))}
                />
                <button type="button" className={item.should ? 'on' : ''} onClick={() => setCases(cases.map((row) => (row.id === item.id ? { ...row, should: !row.should } : row)))}>
                  {item.should ? '应匹配' : '不应匹配'}
                </button>
                <span>{item.error || (item.matched ? '命中' : '未命中')}</span>
                <button type="button" onClick={() => setCases(cases.filter((row) => row.id !== item.id))}>删除</button>
              </div>
            ))}
          </section>
          <pre className="explain">{explain(nodes)}</pre>
        </main>

        <aside className="dock">
          <section className="guide">
            <h2>{guide ? guide.label : '组件说明'}</h2>
            <p>{guide?.hint || '悬停、拖拽或点选一块积木，这里说明它在正则里的用途。'}</p>
          </section>
          <section>
            <h2>标志</h2>
            <div className="flags">
              {FLAG_DEFS.map((flag) => (
                <button
                  key={flag.id}
                  type="button"
                  className={flags.includes(flag.id) ? 'on' : ''}
                  title={flag.desc}
                  onClick={() => toggleFlag(flag.id)}
                >
                  {flag.id} {flag.name}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h2>选中积木</h2>
            {!selectedNode && <p className="hint">点选画布上的积木后可改参数，Delete 删除。</p>}
            {selectedNode && (
              <NodeForm
                node={selectedNode}
                onChange={updateSelected}
                onDelete={removeSelected}
              />
            )}
          </section>
          <section>
            <h2>测试文本</h2>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} />
            {result.error && <p className="errors">{result.error}</p>}
            {result.errorDetail && <details><summary>技术详情</summary><p className="hint" style={{ overflowWrap: 'anywhere' }}>{result.errorDetail}</p></details>}
            {!result.error && (
              <p className="hint">{!pattern ? '请先填写表达式。' : !text ? '请输入待测试的文本。' : result.matches.length ? `找到 ${result.matches.length} 处匹配` : '未找到匹配：表达式语法有效，但当前文本中没有符合条件的内容。'}</p>
            )}
            {multilineWouldMatch && (
              <div className="hint">
                <p>测试文本包含多行。当前未开启 m，^ 和 $ 按整段文本的开头和结尾匹配；已检测到开启 m 后可以找到匹配。如果希望逐行检查，请启用多行模式。</p>
                <button type="button" onClick={() => toggleFlag('m')}>启用 m：逐行匹配</button>
              </div>
            )}
            <Highlight text={text} matches={result.matches} />
            <ul className="matches">
              {result.matches.map((m, i) => (
                <li key={`${m.index}-${i}`}>
                  <strong>#{i + 1}</strong> @{m.index} 「{m.text}」
                  {m.groups.length > 0 && <span> 捕获 {m.groups.map((g) => g ?? '空').join(' / ')}</span>}
                  {m.named && <span> 命名 {JSON.stringify(m.named)}</span>}
                </li>
              ))}
            </ul>
          </section>
        <section className="ai" onPaste={(e) => {
            const files = [];
            [...(e.clipboardData?.items || [])].forEach((item) => {
              if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) files.push(file);
              }
            });
            if (files.length) {
              e.preventDefault();
              addAttachmentFiles(files);
            }
          }}>
        <p className="hint">解释、修正、测试与检查均针对当前表达式，点击执行时读取最新内容。下方可填写补充要求。</p>
        <code className="hint" style={{ overflowWrap: 'anywhere' }}>当前对象：/{pattern || '空'}/{flags}</code>
        <div className="ai-bar">
          {AI_TASKS.map((task) => (
            <button key={task.id} title={task.hint} type="button" className={aiTask === task.id ? 'on' : ''} onClick={() => setAiTask(task.id)} disabled={aiBusy}>
              {task.label}
            </button>
          ))}
          <button type="button" onClick={() => fileRef.current?.click()}>附件</button>
            <button type="button" className="primary" onClick={runAi} disabled={aiBusy || !settings?.hasKey}>
              {aiBusy ? '输出中' : `执行：${AI_TASKS.find((task) => task.id === aiTask)?.label}`}
            </button>
          </div>
          <input ref={fileRef} type="file" multiple hidden accept="image/*,.txt,.json,.md" onChange={(e) => { addAttachmentFiles(e.target.files || []); e.target.value = ''; }} />
          {attachments.length > 0 && (
            <div className="thumbs">
              {attachments.map((file) => (
                <div key={file.id} className="thumb">
                  {file.type.startsWith('image/') ? <img src={file.url} alt={file.name} /> : <span>{file.name}</span>}
                  <button type="button" className="x" onClick={() => setAttachments(attachments.filter((item) => item.id !== file.id))}>×</button>
                </div>
              ))}
            </div>
          )}
        {!settings?.hasKey && (
          <p className="invite">
            还没有 API Key。到设置页保存 ZenMux 密钥，或打开邀请链接领取：
            <a href={INVITE_URL} target="_blank" rel="noreferrer">{INVITE_URL}</a>
          </p>
        )}
        <textarea aria-label="AI 补充要求" placeholder={AI_TASKS.find((task) => task.id === aiTask)?.placeholder} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={3} />
        {aiError && <p className="errors">{aiError}</p>}
        <div className="ai-card">
            {canvasDraft && (
              <div className="send-bar">
                <code>/{canvasPreview}/{typeof aiData?.flags === 'string' ? aiData.flags : flags}</code>
                <button type="button" className="primary" onClick={sendToCanvas}>送到画布</button>
              </div>
            )}
            <div className="ai-bar">
              <button type="button" onClick={copyOutput} disabled={!aiOutput}>{copied ? '已复制' : '复制输出'}</button>
              <button type="button" onClick={applyTests} disabled={!aiData?.tests}>填入用例</button>
            </div>
            {Array.isArray(aiData?.warnings) && aiData.warnings.some((item) => typeof item === 'string' && item.trim()) && (
              <div className="hint">
                <strong>注意事项</strong>
                <ul>{aiData.warnings.filter((item) => typeof item === 'string' && item.trim()).map((item, index) => <li key={index}>{item}</li>)}</ul>
              </div>
            )}
            {aiOutput && <MarkdownView text={aiOutput} streaming={aiBusy} />}
          </div>
        </section>
        </aside>
      </div>

      {settingsOpen && (
        <Settings
          initial={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => {
            setSettings(next);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NodeForm({ node, onChange, onDelete }) {
  useEffect(() => {
    function onKey(e) {
      if ((e.key === 'Backspace' || e.key === 'Delete') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') onDelete();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDelete]);

  return (
    <div className="form">
      {node.kind === 'text' && (
        <label>文本<input value={node.value ?? ''} onChange={(e) => onChange({ value: e.target.value })} /></label>
      )}
      {node.kind === 'raw' && (
        <label>原文<input value={node.source ?? ''} onChange={(e) => onChange({ source: e.target.value })} /></label>
      )}
      {node.kind === 'class' && (
        <>
          <label>类内容<input value={node.body ?? ''} onChange={(e) => onChange({ body: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={!!node.negated} onChange={(e) => onChange({ negated: e.target.checked })} />取反</label>
        </>
      )}
      {node.kind === 'unicode' && (
        <>
          <label>属性<input value={node.prop ?? ''} onChange={(e) => onChange({ prop: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={!!node.negated} onChange={(e) => onChange({ negated: e.target.checked })} />使用 \P</label>
        </>
      )}
      {node.kind === 'backref' && (
        <label>编号或名字<input value={node.ref ?? ''} onChange={(e) => onChange({ ref: e.target.value })} /></label>
      )}
      {node.kind === 'groupOpen' && node.mode === 'named' && (
        <label>组名<input value={node.name ?? ''} onChange={(e) => onChange({ name: e.target.value })} /></label>
      )}
      {node.kind === 'quant' && (
        <>
          {node.preset === 'range' && (
            <div className="row">
              <label>最少<input value={node.min} onChange={(e) => onChange({ min: e.target.value })} /></label>
              <label>最多<input value={node.max} placeholder="空=不限" onChange={(e) => onChange({ max: e.target.value })} /></label>
            </div>
          )}
          <label className="check"><input type="checkbox" checked={!!node.lazy} onChange={(e) => onChange({ lazy: e.target.checked })} />懒惰</label>
        </>
      )}
      <button type="button" onClick={onDelete}>删除这块</button>
    </div>
  );
}

function Settings({ initial, onClose, onSaved }) {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl || DEFAULT_BASE);
  const [models, setModels] = useState(initial?.models || [DEFAULT_MODEL]);
  const [activeModel, setActiveModel] = useState(initial?.activeModel || DEFAULT_MODEL);
  const [draftModel, setDraftModel] = useState('');
  const [proxyMode, setProxyMode] = useState(initial?.proxyMode || 'system');
  const [proxyUrl, setProxyUrl] = useState(initial?.proxyUrl || '');
  const [networkStatus, setNetworkStatus] = useState('');
  const [networkBusy, setNetworkBusy] = useState(false);

  async function checkNetwork(detect = false) {
    setNetworkBusy(true);
    setNetworkStatus('');
    try {
      if (detect) {
        const result = await window.desk.detectProxy(baseUrl);
        setNetworkStatus(`系统检测结果：${result.route}${result.proxyUrl ? '（已填入地址，选择手动代理可使用）' : '（系统未为该地址配置代理）'}`);
        if (result.proxyUrl) setProxyUrl(result.proxyUrl);
      } else {
        const result = await window.desk.testNetwork({ baseUrl, proxyMode, proxyUrl });
        setNetworkStatus(result.message);
      }
    } catch (err) { setNetworkStatus(err.message || '检测失败'); }
    finally { setNetworkBusy(false); }
  }
  const [error, setError] = useState('');

  async function save(extra = {}) {
    setError('');
    try {
      const next = await window.desk.saveSettings({
        apiKey,
        baseUrl,
        models,
        activeModel,
        proxyMode,
        proxyUrl,
        ...extra,
      });
      onSaved(next);
    } catch (err) {
      setError(err.message || '保存失败');
    }
  }

  return (
    <div className="modal">
      <form
        className="sheet"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2>ZenMux 设置</h2>
        <p className="hint">代理可跟随系统自动解析，也可手动指定。连接测试使用当前填写值，保存后应用到 AI 对话。</p>
        <p className="hint">密钥只在本机用户数据目录加密保存。界面不回显明文，只显示密文摘要。</p>
        {!initial?.hasKey && (
          <p className="invite">
            没有 API Key 时可以用邀请链接：
            <a href={INVITE_URL} target="_blank" rel="noreferrer">{INVITE_URL}</a>
          </p>
        )}
        <label>
          API Key
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            placeholder={initial?.hasKey ? '已保存。留空则不更换' : '粘贴 ZenMux API Key'}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        {initial?.hasKey && <p className="cipher">已加密：{initial.keyMask}</p>}
        <label>
          Base URL
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} />
        </label>
        <label>
          代理模式
          <select value={proxyMode} onChange={(e) => { setProxyMode(e.target.value); setNetworkStatus(''); }}>
            <option value="system">自动：跟随系统代理 / PAC</option>
            <option value="manual">手动填写代理</option>
            <option value="direct">直连</option>
          </select>
        </label>
        <label>
          代理地址（手动模式生效）
          <input value={proxyUrl} onChange={(e) => { setProxyUrl(e.target.value); setNetworkStatus(''); }} placeholder="http://127.0.0.1:7897 或 socks5://127.0.0.1:7897" spellCheck={false} />
        </label>
        <div className="row">
          <button type="button" disabled={networkBusy} onClick={() => checkNetwork(true)}>自动检测代理</button>
          <button type="button" disabled={networkBusy} onClick={() => checkNetwork(false)}>{networkBusy ? '检测中…' : '测试连接'}</button>
        </div>
        {networkStatus && <p className="hint" role="status">{networkStatus}</p>}
        <label>
          当前模型
          <select value={activeModel} onChange={(e) => setActiveModel(e.target.value)}>
            {models.map((model) => <option key={model}>{model}</option>)}
          </select>
        </label>
        <div className="row">
          <input
            value={draftModel}
            placeholder="增加模型名称，例如 anthropic/claude-sonnet-4.6"
            onChange={(e) => setDraftModel(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              const name = draftModel.trim();
              if (!name || models.includes(name)) return;
              setModels([...models, name]);
              setActiveModel(name);
              setDraftModel('');
            }}
          >
            增加
          </button>
        </div>
        <ul className="model-list">
          {models.map((model) => (
            <li key={model}>
              <span>{model}</span>
              <button
                type="button"
                onClick={() => {
                  const next = models.filter((m) => m !== model);
                  const list = next.length ? next : [DEFAULT_MODEL];
                  setModels(list);
                  if (activeModel === model) setActiveModel(list[0]);
                }}
              >
                移除
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="errors">{error}</p>}
        <div className="top-actions">
          {initial?.hasKey && (
            <button type="button" onClick={() => save({ clearKey: true, apiKey: '' })}>清除密钥</button>
          )}
          <button type="button" onClick={onClose}>取消</button>
          <button type="submit" className="primary">加密保存</button>
        </div>
      </form>
    </div>
  );
}

function Highlight({ text, matches }) {
  const parts = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.index < cursor) return;
    if (m.index > cursor) parts.push(<span key={`t${cursor}`}>{text.slice(cursor, m.index)}</span>);
    const end = m.index + m.text.length;
    parts.push(<mark key={`m${i}`}>{text.slice(m.index, end) || '∅'}</mark>);
    cursor = Math.max(end, m.index + (m.text.length === 0 ? 1 : 0));
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);
  return <pre className="highlight">{parts}</pre>;
}
