"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ensureLanguageRegistered, isLanguageRegistered, SyntaxHighlighter, vs, vscDarkPlus } from "@/lib/syntax-highlight";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  code: string;
  lang: string;
}

// Keep the native palette without wallpaper; on glass, tint readable ink with
// the existing syntax colors instead of assuming the native theme's backdrop.
function withWallpaperInk(theme: Record<string, CSSProperties>) {
  return Object.fromEntries(Object.entries(theme).map(([selector, style]) => [selector, {
    ...style,
    ...(style.color ? { color: `color-mix(in srgb, var(--wallpaper-code-ink, ${style.color}) 85%, ${style.color})` } : {}),
  }]));
}

const lightCodeTheme = withWallpaperInk(vs);
const darkCodeTheme = withWallpaperInk(vscDarkPlus);

function PlainCode({ code }: { code: string }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: "11px 13px",
        fontSize: "var(--chat-code-font-size)",
        lineHeight: 1.62,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        color: "var(--text)",
        backgroundColor: "color-mix(in srgb, var(--bg) 88%, var(--bg-panel))",
        fontFamily: "var(--font-mono)",
      }}
    >
      {code}
    </pre>
  );
}

export function SyntaxHighlightedCode({ code, lang }: Props) {
  const { isDark } = useTheme();
  const [ready, setReady] = useState(() => isLanguageRegistered(lang));

  useEffect(() => {
    let cancelled = false;
    setReady(isLanguageRegistered(lang));
    const promise = ensureLanguageRegistered(lang);
    if (promise) {
      promise.then(() => { if (!cancelled) setReady(true); });
    }
    return () => { cancelled = true; };
  }, [lang]);

  if (!ready) {
    return <PlainCode code={code} />;
  }

  return (
    <SyntaxHighlighter
      language={lang || "text"}
      style={isDark ? darkCodeTheme : lightCodeTheme}
      showLineNumbers
      lineNumberStyle={{ color: "var(--text-dim)", fontStyle: "normal" }}
      customStyle={{
        margin: 0,
        padding: "11px 13px",
        fontSize: "var(--chat-code-font-size)",
        lineHeight: 1.62,
        borderRadius: 0,
        backgroundColor: "color-mix(in srgb, var(--bg) 88%, var(--bg-panel))",
      }}
      codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
    >
      {code}
    </SyntaxHighlighter>
  );
}
