import { z } from 'zod';

// What the UI Engineer's tools accept (F2.3). The model's tool calls are validated here before
// any code acts on them; the rules about which files may change live in the orchestrator.
export const uiEngineerToolInputs = {
  read_file: z.object({ path: z.string().min(1).max(300) }),
  edit_file: z.object({
    path: z.string().min(1).max(300),
    old_text: z.string().max(20_000),
    new_text: z.string().max(20_000),
  }),
  done: z.object({ summary: z.string().min(1).max(2000) }),
} as const;
