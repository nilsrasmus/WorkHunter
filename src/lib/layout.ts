import { useEffect, useState } from "react";

export const DOC_PREVIEW_HEIGHT_VH = 110;

export function docPreviewHeightPx(): number {
  if (typeof window === "undefined") return 640;
  return Math.round(window.innerHeight * (DOC_PREVIEW_HEIGHT_VH / 100));
}

export function useDocPreviewHeight(): number {
  const [height, setHeight] = useState(docPreviewHeightPx);

  useEffect(() => {
    const update = () => setHeight(docPreviewHeightPx());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return height;
}
