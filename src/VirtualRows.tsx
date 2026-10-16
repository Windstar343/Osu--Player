import { memo, ReactNode, useEffect, useRef, useState } from "react";
const Row = memo(function Row<T>({
  item,
  index,
  height,
  render,
}: {
  item: T;
  index: number;
  height: number;
  render: (item: T, index: number) => ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: index * height,
        height,
        width: "100%",
      }}
    >
      {render(item, index)}
    </div>
  );
}) as <T>(props: {
  item: T;
  index: number;
  height: number;
  render: (item: T, index: number) => ReactNode;
}) => ReactNode;
export function VirtualRows<T>({
  items,
  height,
  render,
  overscan = 5,
}: {
  items: T[];
  height: number;
  render: (item: T, index: number) => ReactNode;
  overscan?: number;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [first, setFirst] = useState(0),
    [size, setSize] = useState(600);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(() => setSize(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = 0;
    setFirst(0);
  }, [height]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const limit = Math.max(0, items.length * height - element.clientHeight);
    if (element.scrollTop > limit) element.scrollTop = limit;
    setFirst(Math.floor(element.scrollTop / height));
  }, [items.length, height]);
  const start = Math.max(0, first - overscan),
    end = Math.min(
      items.length,
      first + Math.ceil(size / height) + 1 + overscan,
    );
  return (
    <div
      className="virtual-viewport"
      ref={viewport}
      onScroll={(e) => setFirst(Math.floor(e.currentTarget.scrollTop / height))}
    >
      <div style={{ height: items.length * height, position: "relative" }}>
        {items.slice(start, end).map((item, offset) => (
          <Row
            key={start + offset}
            item={item}
            index={start + offset}
            height={height}
            render={render}
          />
        ))}
      </div>
    </div>
  );
}
