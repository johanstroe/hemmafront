import { useEffect, useRef } from "react";

export function useAppEnter(onEnter: () => void) {
  const callback = useRef(onEnter);
  callback.current = onEnter;

  useEffect(() => {
    const run = () => callback.current();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") run();
    };

    window.addEventListener("focus", run);
    window.addEventListener("pageshow", run);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", run);
      window.removeEventListener("pageshow", run);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
