import { ReactNode, useEffect, useRef, useState } from "react";
export function VirtualRows<T>({
  items,
  height,
  render,
}: {
  items: T[];
  height: number;
  render: (item: T, index: number) => ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [size, setSize] = useState(600);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(() => setSize(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = 0;
    setTop(0);
  }, [items, height]);
  const start = Math.max(0, Math.floor(top / height) - 5);
  const end = Math.min(items.length, Math.ceil((top + size) / height) + 5);
  return (
    <div
      className="virtual-viewport"
      ref={viewport}
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * height, position: "relative" }}>
        {items.slice(start, end).map((item, offset) => (
          <div
            key={start + offset}
            style={{
              position: "absolute",
              top: (start + offset) * height,
              height,
              width: "100%",
            }}
          >
            {render(item, start + offset)}
          </div>
        ))}
      </div>
    </div>
  );
}
