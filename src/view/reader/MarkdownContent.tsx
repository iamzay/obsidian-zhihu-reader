import { useEffect, useRef, useState } from "react";
import { type App, MarkdownRenderChild, MarkdownRenderer } from "obsidian";

import { startMarkdownRender } from "@/view/reader/MarkdownRenderLifecycle";

export function MarkdownContent({
  app,
  markdown,
}: {
  readonly app: App;
  readonly markdown: string;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return undefined;
    }

    setRenderError(null);
    let renderChild: MarkdownRenderChild | null = null;
    const handle = startMarkdownRender(
      container,
      async (host) => {
        const renderHost = host as HTMLElement;
        renderChild = new MarkdownRenderChild(renderHost);
        renderChild.load();
        await MarkdownRenderer.render(
          app,
          markdown,
          renderHost,
          "",
          renderChild,
        );
      },
      () => {
        setRenderError("Obsidian 无法渲染转换后的 Markdown，请在浏览器中阅读原文。");
      },
    );

    return () => {
      renderChild?.unload();
      handle.dispose();
    };
  }, [app, markdown]);

  return (
    <>
      {renderError !== null && (
        <div className="zhihu-answer-conversion-error" role="alert">
          {renderError}
        </div>
      )}
      <div
        className="markdown-rendered"
        ref={containerRef}
        hidden={renderError !== null}
      />
    </>
  );
}
