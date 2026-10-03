import { Fragment } from "react";

/**
 * Renderiza o mini-markdown dos textos do bot: **negrito**, quebras de linha e links https.
 * Sem dangerouslySetInnerHTML — tudo passa pelo React (escapado).
 */
const TOKEN = /(\*\*[^*]+\*\*|https:\/\/[^\s]+)/g;

function Inline({ line }) {
  return line.split(TOKEN).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <b key={i} className="font-semibold text-white">{part.slice(2, -2)}</b>;
    if (part.startsWith("https://")) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline text-blue-400 break-all">{part}</a>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function RichText({ text }) {
  return String(text ?? "").split("\n").map((line, i) => (
    <p key={i} className={i ? "mt-1.5" : ""}><Inline line={line} /></p>
  ));
}
