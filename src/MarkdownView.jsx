import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

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
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: 'ignore' }]]}
      >
        {streaming ? stabilize(text) : text}
      </ReactMarkdown>
    </div>
  );
}
