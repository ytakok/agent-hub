// localStorage can throw (private mode, blocked storage); preferences are a convenience, never required.
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`ah.${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(`ah.${key}`, value);
    } catch {
      /* ignore */
    }
  },
};
