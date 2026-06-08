// This file globally types the window.frappe object
declare global {
  interface Window {
    frappe: {
      call: (options: {
        method: string;
        args?: Record<string, any>;
        callback?: (response: any) => void;
      }) => Promise<any>;
      get_route: () => string[];
      show_alert: (options: { message: string; indicator?: "green" | "red" | "orange" | "blue" }) => void;
      new_doc: (doctype: string, doc_args: Record<string, any>) => void;
    };
    npdi_subtask_inheritance?: {
      startDate?: string;
      dependencies?: string[];
    };
  }
}

export {};
