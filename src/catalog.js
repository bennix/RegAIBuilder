export const INVITE_URL = 'https://zenmux.ai/invite/GBQMC5';
export const DEFAULT_BASE = 'https://zenmux.ai/api/v1';
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';

export const PALETTE = [
  {
    group: '字面量',
    items: [
      { kind: 'text', label: '文本', hint: '按字面匹配一段固定文字。点、星号、括号等会自动转义，不会变成元字符。适合域名、关键字、固定前后缀。', fields: { value: 'abc' } },
      { kind: 'any', label: '任意字符 .', hint: '匹配除换行以外的任意一个字符。打开 s（dotAll）后，点号也可以匹配换行。它不表示“任意长度”。', },
      { kind: 'raw', label: '原始片段', hint: '把你写的源码原样拼进表达式，不做转义。适合编辑器还没做成积木的高级语法。写错时测试区会直接报编译错误。', fields: { source: '\\k<name>' } },
    ],
  },
  {
    group: '字符类',
    items: [
      { kind: 'digit', label: '数字 \\d', hint: '匹配一个十进制数字 0-9，等价于 [0-9]。常和量词一起表示年份、验证码、序号。' },
      { kind: 'nonDigit', label: '非数字 \\D', hint: '匹配一个不是数字的字符。适合把数字字段和分隔符分开。' },
      { kind: 'word', label: '单词字符 \\w', hint: '匹配字母、数字或下划线。默认不含汉字；需要汉字时改用 Unicode 属性或自定义字符类。' },
      { kind: 'nonWord', label: '非单词 \\W', hint: '匹配字母、数字、下划线以外的一个字符，例如空格、标点和连字符。' },
      { kind: 'space', label: '空白 \\s', hint: '匹配空格、制表符、换行等空白。常用来跳过单词之间的间隔。' },
      { kind: 'nonSpace', label: '非空白 \\S', hint: '匹配一个可见字符。+ 量词配合它，可以吃掉一整段不含空白的文本。' },
      { kind: 'class', label: '自定义 []', hint: '方括号里列出允许出现的字符。a-z 表示范围。勾选取反后变成“除这些字符以外”。连字符和右方括号要按字符类规则书写。', fields: { body: 'a-z', negated: false } },
      { kind: 'unicode', label: 'Unicode \\p{}', hint: '按 Unicode 属性匹配，例如 L 是字母，N 是数字，Han 是汉字。需要打开 u 标志。勾选 \\P 表示不属于该属性。', fields: { prop: 'L', negated: false } },
    ],
  },
  {
    group: '锚点与边界',
    items: [
      { kind: 'anchorStart', label: '行首 ^', hint: '锚在字符串开头，本身不消耗字符。打开 m 后，也锚在每一行的开头。用来禁止前面还有多余内容。' },
      { kind: 'anchorEnd', label: '行尾 $', hint: '锚在字符串结尾。打开 m 后，也锚在每一行的结尾。和行首一起使用，表示整段必须完全符合。' },
      { kind: 'wordBoundary', label: '单词边界 \\b', hint: '位置夹在单词字符和非单词字符之间，或位于开头结尾。适合匹配完整单词，而不是更长单词里的一段。' },
      { kind: 'nonWordBoundary', label: '非边界 \\B', hint: '当前位置不是单词边界。适合匹配单词内部，例如字母后面紧跟的数字。' },
    ],
  },
  {
    group: '量词',
    items: [
      { kind: 'quant', label: '零或多 *', hint: '前一个原子可以出现任意次，也可以一次都没有。默认贪婪，会尽量多吃；勾选懒惰后尽量少吃。嵌套量词容易造成灾难性回溯。', fields: { preset: '*', min: 0, max: '', lazy: false } },
      { kind: 'quant', label: '一或多 +', hint: '前一个原子至少出现一次。适合“必须有内容”的字段，例如用户名、域名标签。', fields: { preset: '+', min: 1, max: '', lazy: false } },
      { kind: 'quant', label: '可选 ?', hint: '前一个原子出现 0 次或 1 次。适合可选的协议、符号或尾缀。它修饰的是紧挨着的前一个原子，不是整段表达式。', fields: { preset: '?', min: 0, max: 1, lazy: false } },
      { kind: 'quant', label: '区间 {n,m}', hint: '限定前一个原子的最少和最多次数。最多留空表示不设上限。位数固定的验证码、日期分量常用它。', fields: { preset: 'range', min: 1, max: 3, lazy: false } },
    ],
  },
  {
    group: '分组与断言',
    items: [
      { kind: 'groupOpen', label: '捕获组 (', hint: '把中间的匹配记下来，测试结果里按顺序显示。也可以作为整体被后面的量词修饰。记得配一个组结束。', fields: { mode: 'capture', name: 'id' } },
      { kind: 'groupOpen', label: '非捕获 (?:', hint: '只负责分组，不占用捕获编号。适合把几个分支收成一个整体再加量词，同时避免打乱后面的反向引用编号。', fields: { mode: 'noncap', name: '' } },
      { kind: 'groupOpen', label: '命名组', hint: '给捕获结果起名字，测试区会显示命名结果。名字需以字母或下划线开头。引用它时用反向引用积木填写同一个名字。', fields: { mode: 'named', name: 'name' } },
      { kind: 'groupClose', label: '组结束 )', hint: '结束最近一个尚未闭合的分组或断言。多出来的结束符会在画布下方报错。' },
      { kind: 'groupOpen', label: '正向前瞻 (?=', hint: '要求后面必须能匹配括号里的内容，但匹配位置不往前走，括号里的文字也不会被吃掉。适合“后面得是某个单位”这类条件。', fields: { mode: 'ahead', name: '' } },
      { kind: 'groupOpen', label: '负向前瞻 (?!', hint: '要求后面不能是括号里的内容，同样不消耗字符。适合排除扩展名、关键字或非法尾缀。', fields: { mode: 'aheadNot', name: '' } },
      { kind: 'groupOpen', label: '正向后顾 (?<=', hint: '要求当前位置前面已经是指定内容，不把这段内容算进本次匹配。JavaScript 要求后顾里的长度可以确定。', fields: { mode: 'behind', name: '' } },
      { kind: 'groupOpen', label: '负向后顾 (?<!', hint: '要求当前位置前面不是指定内容。适合“前面不能是反斜杠”这类转义判断。', fields: { mode: 'behindNot', name: '' } },
      { kind: 'backref', label: '反向引用', hint: '再次匹配前面某个捕获组已经捕获到的同一段文字。填数字表示第几个捕获组，填名字表示命名组。', fields: { ref: '1' } },
      { kind: 'alt', label: '或 |', hint: '左右两边满足一边即可，优先级低于相邻的连接。若只想让一小段二选一，先用分组把分支包起来。' },
    ],
  },
];

export const SAMPLES = [
  { name: '邮箱', pattern: '^[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+$', flags: 'i', sample: 'ada@example.com\nbad@\nAda.Lovelace@lab.co.uk' },
  { name: '中国手机', pattern: '^1[3-9]\\d{9}$', flags: '', sample: '13800138000\n12345678901\n19900001111' },
  { name: 'IPv4', pattern: '^(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)$', flags: '', sample: '192.168.0.1\n256.1.1.1\n10.0.0.255' },
  { name: '日期', pattern: '^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])$', flags: '', sample: '2026-11-01\n2026-13-01\n1999-02-29' },
  { name: '十六进制颜色', pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$', flags: '', sample: '#fff\n#e8a15a\n#11223344\n#gg0000' },
];

export const FLAG_DEFS = [
  { id: 'g', name: 'global', desc: '找出全部匹配，而不是只找第一处' },
  { id: 'i', name: 'ignoreCase', desc: '忽略英文字母大小写' },
  { id: 'm', name: 'multiline', desc: '^ 和 $ 匹配每一行的开头和结尾' },
  { id: 's', name: 'dotAll', desc: '. 可以匹配换行' },
  { id: 'u', name: 'unicode', desc: '按 Unicode 码点处理，启用 \\p{}' },
  { id: 'v', name: 'unicodeSets', desc: '集合模式的字符类，支持差集与交集' },
  { id: 'd', name: 'hasIndices', desc: '为每个捕获组提供开始和结束下标' },
  { id: 'y', name: 'sticky', desc: '从 lastIndex 开始的粘连匹配' },
];

let seq = 1;
export function uid() {
  seq += 1;
  return `n${Date.now().toString(36)}${seq}`;
}

export function makeNode(item) {
  return { id: uid(), kind: item.kind, ...(item.fields || {}) };
}

const BLOCK_FIELDS = ['value', 'source', 'body', 'negated', 'prop', 'ref', 'name', 'preset', 'min', 'max', 'lazy', 'mode'];

export function paletteItems() {
  return PALETTE.flatMap((group) => group.items);
}

export function guideFor(node) {
  const items = paletteItems().filter((item) => item.kind === node.kind);
  return (
    items.find((item) => item.fields?.preset && item.fields.preset === node.preset)
    || items.find((item) => item.fields?.mode && item.fields.mode === node.mode)
    || items[0]
    || null
  );
}

export function nodeFromSpec(spec) {
  const items = paletteItems().filter((item) => item.kind === spec.kind);
  const item = items.find((entry) => entry.fields?.preset && entry.fields.preset === spec.preset)
    || items.find((entry) => entry.fields?.mode && entry.fields.mode === spec.mode)
    || items[0];
  if (!item) return null;
  const node = makeNode(item);
  BLOCK_FIELDS.forEach((key) => {
    if (spec[key] !== undefined) node[key] = spec[key];
  });
  return node;
}
