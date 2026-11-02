import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

function AnswerBlock({ children, node, ...props }) {
  const code = Array.isArray(children) ? children[0] : children;
  if (code?.props?.className?.split(' ').includes('language-json')) {
    return (
      <details className="ai-structured-data">
        <summary>查看结构化数据（供画布和测试用例使用）</summary>
        <p className="hint">这部分由程序读取，无需手动编辑。点击“送到画布”可应用表达式，点击“填入用例”可导入测试。</p>
        <p className="hint">flags：匹配选项；warnings：注意事项；tests：测试用例；blocks：表达式积木；pattern：正则源码。</p>
        <pre {...props}>{children}</pre>
      </details>
    );
  }
  return <pre {...props}>{children}</pre>;
}

function stabilize(text) {
  let next = text;
  const fences = next.match(/```/g)?.length || 0;
  if (fences % 2 === 1) next += '\n```';
  const blocks = next.match(/\$\$/g)?.length || 0;
  if (blocks % 2 === 1) next += '$$';
  return next;
}

export function MarkdownView({ text, streaming }) {
  return (
    <div className="md">
      <ReactMarkdown
        components={{ pre: AnswerBlock }}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: 'ignore' }]]}
      >
        {streaming ? stabilize(text) : text}
      </ReactMarkdown>
    </div>
  );
}
