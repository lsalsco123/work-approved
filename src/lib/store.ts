"use client";
import { useEffect, useState, useCallback } from "react";
import { PermitData, emptyPermit } from "./types";

const KEY = "permit-draft-v1";

export function usePermit(opts?: { disableLocalStorage?: boolean }) {
  const [data, setData] = useState<PermitData>(emptyPermit);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (opts?.disableLocalStorage) { setLoaded(true); return; }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setData({ ...emptyPermit(), ...JSON.parse(raw) });
    } catch {}
    setLoaded(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loaded && !opts?.disableLocalStorage) {
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
    }
  }, [data, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(<K extends keyof PermitData>(k: K, v: PermitData[K]) => {
    setData((d) => ({ ...d, [k]: v }));
  }, []);

  const toggleIn = useCallback((k: keyof PermitData, value: string) => {
    setData((d) => {
      const arr = (d[k] as unknown as string[]) || [];
      const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
      return { ...d, [k]: next as any };
    });
  }, []);

  const reset = useCallback(() => setData(emptyPermit()), []);

  return { data, setData, update, toggleIn, reset, loaded };
}
