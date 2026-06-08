/**
 * A centralized wrapper for `window.frappe.call` to ensure type safety,
 * standardized error handling, and avoiding hardcoded strings everywhere.
 */

interface FrappeResponse<T = any> {
  message?: T;
  exc?: string;
  exc_type?: string;
}

export const frappeClient = {
  call: async <T = any>(
    method: string,
    args?: Record<string, any>,
    signal?: AbortSignal
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!window.frappe) {
        return resolve({} as T);
      }

      if (signal?.aborted) {
        return reject(new DOMException("Aborted", "AbortError"));
      }

      const request = window.frappe.call({
        method,
        args,
        callback: (r: FrappeResponse<T>) => {
          if (r.exc) {
            reject(new Error(r.exc_type || "Frappe Error"));
          } else {
            resolve(r.message as T);
          }
        },
      });

      if (signal) {
        signal.addEventListener("abort", () => {
          // Frappe natively returns a jqXHR object which we could theoretically abort
          // However, for safety we simply reject the promise and let React ignore it.
          reject(new DOMException("Aborted", "AbortError"));
        });
      }
    });
  },
};
