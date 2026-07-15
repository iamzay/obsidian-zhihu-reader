export interface MarkdownRenderElement {
  empty(): void;
  createDiv(): MarkdownRenderElement;
  remove(): void;
}

export interface MarkdownRenderHandle {
  readonly completion: Promise<void>;
  dispose(): void;
}

export function startMarkdownRender(
  container: MarkdownRenderElement,
  render: (host: MarkdownRenderElement) => Promise<void>,
  onError: () => void,
): MarkdownRenderHandle {
  let active = true;
  container.empty();
  const host = container.createDiv();
  const completion = render(host).catch(() => {
    if (active) {
      onError();
    }
  });
  return {
    completion,
    dispose: () => {
      active = false;
      host.remove();
    },
  };
}
