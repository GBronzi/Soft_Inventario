import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [delayMs, value]);

  return debouncedValue;
}