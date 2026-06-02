import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem('dialin.' + key);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  }
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem('dialin.' + key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }
}
