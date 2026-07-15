import { useEffect, useRef, useState } from "react";
import { type App, MarkdownRenderChild, MarkdownRenderer } from "obsidian";

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

    let active = true;
    setRenderError(null);
    container.empty();
    const renderChild = new MarkdownRenderChild(container);
    renderChild.load();
    void MarkdownRenderer.render(app, markdown, container, "", renderChild).catch(
      () => {
        if (active) {
          setRenderError("Obsidian 无法渲染转换后的 Markdown，请在浏览器中阅读原文。");
        }
      },
    );

    return () => {
      active = false;
      renderChild.unload();
      container.empty();
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
