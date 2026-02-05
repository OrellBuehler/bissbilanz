import { toast } from 'svelte-sonner';

export const showError = (message: string) => toast.error(message);
export const showSuccess = (message: string) => toast.success(message);
export const showInfo = (message: string) => toast.info(message);

// Re-export toast for direct usage
export { toast };
