type ToastMessage = {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info';
};

let toasts = $state<ToastMessage[]>([]);

export const getToasts = () => toasts;

export const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
	const id = crypto.randomUUID();
	toasts = [...toasts, { id, message, type }];
	setTimeout(() => removeToast(id), 5000);
	return id;
};

export const removeToast = (id: string) => {
	toasts = toasts.filter((t) => t.id !== id);
};

export const showError = (message: string) => addToast(message, 'error');
export const showSuccess = (message: string) => addToast(message, 'success');
export const showInfo = (message: string) => addToast(message, 'info');
