const ESCAPE = /[.*+?^${}()|[\]\\]/g;

function escapeLiteral(value) {
  return String(value).replace(ESCAPE, '\\$&');
}

function quantSource(node) {
  let body;
  if (node.preset === '*') body = '*';
  else if (node.preset === '+') body = '+';
  else if (node.preset === '?') body = '?';
  else {
    const min = node.min === '' || node.min == null ? 0 : Number(node.min);
    const max = node.max === '' || node.max == null ? null : Number(node.max);
    if (!Number.isFinite(min) || min < 0) return { error: '量词下限无效' };
    if (max == null) body = `{${min},}`;
    else if (!Number.isFinite(max) || max < min) return { error: '量词上限无效' };
    else body = min === max ? `{${min}}` : `{${min},${max}}`;
  }
  if (node.lazy) body += '?';
  return { source: body };
}

function openSource(node) {
  switch (node.mode) {
    case 'noncap':
      return '(?:';
    case 'named': {
      const name = String(node.name || '').trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return { error: '命名分组名称无效' };
      return { source: `(?<${name}>` };
    }
    case 'ahead':
      return '(?=';
    case 'aheadNot':
      return '(?!';
    case 'behind':
      return '(?<=';
    case 'behindNot':
      return '(?<!';
    default:
      return '(';
  }
}

export function compile(nodes) {
  let source = '';
  const errors = [];
  let depth = 0;
  nodes.forEach((node, index) => {
    const piece = pieceOf(node);
    if (piece.error) errors.push({ index, message: piece.error });
    else source += piece.source ?? piece;
    if (node.kind === 'groupOpen') depth += 1;
    if (node.kind === 'groupClose') depth -= 1;
  });
  if (depth !== 0) errors.push({ index: -1, message: depth > 0 ? '有分组没有闭合' : '分组结束符多于开始符' });
  return { source, errors };
}

function pieceOf(node) {
  switch (node.kind) {
    case 'text':
      return escapeLiteral(node.value ?? '');
    case 'any':
      return '.';
    case 'digit':
      return '\\d';
    case 'nonDigit':
      return '\\D';
    case 'word':
      return '\\w';
    case 'nonWord':
      return '\\W';
    case 'space':
      return '\\s';
    case 'nonSpace':
      return '\\S';
    case 'anchorStart':
      return '^';
    case 'anchorEnd':
      return '$';
    case 'wordBoundary':
      return '\\b';
    case 'nonWordBoundary':
      return '\\B';
    case 'alt':
      return '|';
    case 'groupClose':
      return ')';
    case 'groupOpen':
      return openSource(node);
    case 'quant':
      return quantSource(node);
    case 'class': {
      const body = String(node.body ?? '');
      if (body.includes('\n')) return { error: '字符类不能换行' };
      return node.negated ? `[^${body}]` : `[${body}]`;
    }
    case 'unicode': {
      const prop = String(node.prop ?? '').trim();
      if (!prop || /[{}\\]/.test(prop)) return { error: 'Unicode 属性无效' };
      return node.negated ? `\\P{${prop}}` : `\\p{${prop}}`;
    }
    case 'backref': {
      const ref = String(node.ref ?? '').trim();
      if (/^\d+$/.test(ref)) return `\\${ref}`;
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) return `\\k<${ref}>`;
      return { error: '反向引用无效' };
    }
    case 'raw':
      return String(node.source ?? '');
    default:
      return { error: '未知积木' };
  }
}

export function explain(nodes) {
  if (!nodes.length) return '画布是空的。从左侧拖一块积木进来。';
  return nodes
    .map((node, i) => `${i + 1}. ${describe(node)}`)
    .join('\n');
}

function describe(node) {
  switch (node.kind) {
    case 'text':
      return `字面量「${node.value ?? ''}」`;
    case 'any':
      return '任意单个字符';
    case 'digit':
      return '一个数字';
    case 'nonDigit':
      return '一个非数字';
    case 'word':
      return '单词字符（字母、数字或下划线）';
    case 'nonWord':
      return '非单词字符';
    case 'space':
      return '空白';
    case 'nonSpace':
      return '非空白';
    case 'anchorStart':
      return '锚在开头';
    case 'anchorEnd':
      return '锚在结尾';
    case 'wordBoundary':
      return '单词边界';
    case 'nonWordBoundary':
      return '非单词边界';
    case 'alt':
      return '或者，左右分支二选一';
    case 'groupClose':
      return '结束当前分组';
    case 'groupOpen':
      return {
        capture: '开始捕获分组',
        noncap: '开始非捕获分组',
        named: `开始命名分组「${node.name || ''}」`,
        ahead: '开始正向前瞻（后面必须是…，不消耗字符）',
        aheadNot: '开始负向前瞻（后面不能是…）',
        behind: '开始正向后顾（前面必须是…）',
        behindNot: '开始负向后顾（前面不能是…）',
      }[node.mode] || '开始分组';
    case 'quant': {
      const lazy = node.lazy ? '，懒惰匹配' : '，贪婪匹配';
      if (node.preset === '*') return `前一个原子重复零次或多次${lazy}`;
      if (node.preset === '+') return `前一个原子重复一次或多次${lazy}`;
      if (node.preset === '?') return `前一个原子可有可无${lazy}`;
      const max = node.max === '' || node.max == null ? '不限' : node.max;
      return `前一个原子重复 ${node.min} 到 ${max} 次${lazy}`;
    }
    case 'class':
      return `${node.negated ? '不在' : '属于'}字符类 [${node.body ?? ''}]`;
    case 'unicode':
      return `${node.negated ? '不属于' : '属于'} Unicode 属性 ${node.prop}`;
    case 'backref':
      return `引用前面的分组 ${node.ref}`;
    case 'raw':
      return `原始片段 ${node.source ?? ''}`;
    default:
      return node.kind;
  }
}

function readClass(source, start) {
  let i = start + 1;
  if (source[i] === '^') i += 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === ']') return i;
    i += 1;
  }
  return -1;
}

function node(kind, extra = {}) {
  return { id: `p${kind}${extra.id || Math.random().toString(36).slice(2, 8)}`, kind, ...extra };
}

export function parsePattern(source) {
  const nodes = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') {
      const n = source[i + 1];
      const map = {
        d: 'digit',
        D: 'nonDigit',
        w: 'word',
        W: 'nonWord',
        s: 'space',
        S: 'nonSpace',
        b: 'wordBoundary',
        B: 'nonWordBoundary',
      };
      if (!n) {
        nodes.push(node('text', { value: '\\' }));
        i += 1;
        continue;
      }
      if (map[n]) {
        nodes.push(node(map[n]));
        i += 2;
        continue;
      }
      if (n === 'p' || n === 'P') {
        const m = source.slice(i).match(/^\\[pP]\{([^}]+)\}/);
        if (m) {
          nodes.push(node('unicode', { prop: m[1], negated: n === 'P' }));
          i += m[0].length;
          continue;
        }
      }
      if (n === 'k') {
        const m = source.slice(i).match(/^\\k<([^>]+)>/);
        if (m) {
          nodes.push(node('backref', { ref: m[1] }));
          i += m[0].length;
          continue;
        }
      }
      if (/\d/.test(n)) {
        nodes.push(node('backref', { ref: n }));
        i += 2;
        continue;
      }
      nodes.push(node('text', { value: n }));
      i += 2;
      continue;
    }
    if (c === '.') {
      nodes.push(node('any'));
      i += 1;
      continue;
    }
    if (c === '^') {
      nodes.push(node('anchorStart'));
      i += 1;
      continue;
    }
    if (c === '$') {
      nodes.push(node('anchorEnd'));
      i += 1;
      continue;
    }
    if (c === '|') {
      nodes.push(node('alt'));
      i += 1;
      continue;
    }
    if (c === ')') {
      nodes.push(node('groupClose'));
      i += 1;
      continue;
    }
    if (c === '(') {
      const rest = source.slice(i);
      const named = rest.match(/^\(\?<([A-Za-z_][A-Za-z0-9_]*)>/);
      if (named) {
        nodes.push(node('groupOpen', { mode: 'named', name: named[1] }));
        i += named[0].length;
        continue;
      }
      const modes = [
        ['(?<=', 'behind'],
        ['(?<!', 'behindNot'],
        ['(?:', 'noncap'],
        ['(?=', 'ahead'],
        ['(?!', 'aheadNot'],
      ];
      const hit = modes.find(([prefix]) => rest.startsWith(prefix));
      if (hit) {
        nodes.push(node('groupOpen', { mode: hit[1], name: '' }));
        i += hit[0].length;
        continue;
      }
      nodes.push(node('groupOpen', { mode: 'capture', name: '' }));
      i += 1;
      continue;
    }
    if (c === '[') {
      const end = readClass(source, i);
      if (end < 0) {
        nodes.push(node('raw', { source: source.slice(i) }));
        break;
      }
      const inner = source.slice(i + 1, end);
      const negated = inner.startsWith('^');
      nodes.push(node('class', { body: negated ? inner.slice(1) : inner, negated }));
      i = end + 1;
      continue;
    }
    if (c === '*' || c === '+' || c === '?') {
      nodes.push(node('quant', { preset: c, min: c === '+' ? 1 : 0, max: c === '?' ? 1 : '', lazy: false }));
      i += 1;
      if (source[i] === '?') {
        nodes[nodes.length - 1].lazy = true;
        i += 1;
      }
      continue;
    }
    if (c === '{') {
      const m = source.slice(i).match(/^\{(\d+)(,(\d+)?)?\}(\?)?/);
      if (m) {
        nodes.push(
          node('quant', {
            preset: 'range',
            min: Number(m[1]),
            max: m[2] == null ? Number(m[1]) : m[3] == null ? '' : Number(m[3]),
            lazy: Boolean(m[4]),
          }),
        );
        i += m[0].length;
        continue;
      }
    }
    let j = i + 1;
    while (j < source.length && !'\\.^$|()[]{}*+?'.includes(source[j])) j += 1;
    nodes.push(node('text', { value: source.slice(i, j) }));
    i = j;
  }
  return nodes;
}

export function explainPatternError(source, message) {
  if (/Invalid named capture referenced|Invalid named backreference/i.test(message)) {
    const declared = new Set();
    const referenced = new Set();
    let inClass = false;
    for (let i = 0; i < source.length; i += 1) {
      if (source[i] === '\\') {
        const ref = !inClass && source.slice(i).match(/^\\k<([^>]+)>/);
        if (ref) { referenced.add(ref[1]); i += ref[0].length - 1; }
        else i += 1;
      } else if (source[i] === '[') inClass = true;
      else if (source[i] === ']') inClass = false;
      else if (!inClass) {
        const group = source.slice(i).match(/^\(\?<([^=!][^>]*)>/);
        if (group) declared.add(group[1]);
      }
    }
    const missing = [...referenced].filter((name) => !declared.has(name));
    const name = missing[0] || 'name';
    return `引用的命名捕获组不存在${missing.length ? `：${missing.join('、')}` : ''}。\\k<${name}> 表示再次匹配名为“${name}”的分组先前捕获的同一段文本；需要先用 (?<${name}>...) 定义该分组，名称必须一致。若只是想匹配普通文本，请删除这个反向引用积木，换成文本或字符类积木；name 是示例名称，不会自动创建分组。`;
  }
  const hints = [
    [/Unterminated character class/i, '字符类缺少右方括号 ]。请检查 [ 与 ] 是否配对；匹配字面量方括号时可使用文本积木。'],
    [/Unterminated group/i, '分组缺少右括号 )。请为每个分组开始积木添加对应的分组结束积木。'],
    [/Unmatched '\)'/i, '多了一个右括号 )。请删除多余的分组结束积木，或补上对应的分组开始积木。'],
    [/Nothing to repeat/i, '量词前没有可重复的内容。请把 *、+、? 或次数量词放在字符、字符类或完整分组之后。'],
    [/Range out of order|numbers out of order/i, '范围的起点大于终点。请检查字符范围（如 [a-z]）或重复次数（如下限 2、上限 4）的顺序。'],
    [/Duplicate capture group name/i, '命名捕获组名称重复。请为不同分组使用不同名称，并同步修改对应的反向引用。'],
    [/Invalid capture group name/i, '命名捕获组名称无效。建议使用字母或下划线开头的名称，例如 word、year。'],
    [/Invalid escape/i, '转义写法无效。请检查反斜杠后的字符；如果要匹配普通文本，可改用文本积木自动转义。'],
    [/Invalid flags/i, '正则标志无效。请检查所选标志是否受当前运行环境支持。'],
  ];
  return hints.find(([pattern]) => pattern.test(message))?.[1] || '正则表达式语法有误，暂时无法执行匹配。请检查括号、字符类、量词及原始片段的写法，可展开技术详情查看原始错误。';
}

export function testPattern(source, flags, text) {
  if (!source) return { ok: true, matches: [], error: '' };
  let re;
  const flagSet = flags.includes('g') ? flags : `${flags}g`;
  const unique = [...new Set(flagSet.split(''))].join('');
  try {
    re = new RegExp(source, unique);
  } catch (err) {
    return { ok: false, matches: [], error: explainPatternError(source, err.message), errorDetail: err.message };
  }
  const matches = [];
  let guard = 0;
  for (const match of text.matchAll(re)) {
    if (match[0] === '' && match.index === (matches.at(-1)?.index ?? -1)) break;
    matches.push({
      index: match.index,
      text: match[0],
      groups: match.slice(1),
      named: match.groups || null,
    });
    guard += 1;
    if (guard > 200) break;
    if (match[0] === '') re.lastIndex += 1;
  }
  return { ok: true, matches, error: '' };
}

export function chipLabel(node) {
  switch (node.kind) {
    case 'text':
      return node.value || '空文本';
    case 'any':
      return '.';
    case 'digit':
      return '\\d';
    case 'nonDigit':
      return '\\D';
    case 'word':
      return '\\w';
    case 'nonWord':
      return '\\W';
    case 'space':
      return '\\s';
    case 'nonSpace':
      return '\\S';
    case 'anchorStart':
      return '^';
    case 'anchorEnd':
      return '$';
    case 'wordBoundary':
      return '\\b';
    case 'nonWordBoundary':
      return '\\B';
    case 'alt':
      return '|';
    case 'groupClose':
      return ')';
    case 'groupOpen':
      return { capture: '(', noncap: '(?:', named: `(?<${node.name || '?'}>`, ahead: '(?=', aheadNot: '(?!', behind: '(?<=', behindNot: '(?<!' }[node.mode] || '(';
    case 'quant':
      if (node.preset === '*') return node.lazy ? '*?' : '*';
      if (node.preset === '+') return node.lazy ? '+?' : '+';
      if (node.preset === '?') return node.lazy ? '??' : '?';
      return `${node.max === '' || node.max == null ? `{${node.min},}` : node.min === node.max ? `{${node.min}}` : `{${node.min},${node.max}}`}${node.lazy ? '?' : ''}`;
    case 'class':
      return `${node.negated ? '[^' : '['}${node.body || ''}]`;
    case 'unicode':
      return `${node.negated ? '\\P' : '\\p'}{${node.prop || ''}}`;
    case 'backref':
      return /^[A-Za-z_]/.test(node.ref || '') ? `\\k<${node.ref}>` : `\\${node.ref || ''}`;
    case 'raw':
      return node.source || 'raw';
    default:
      return node.kind;
  }
}
