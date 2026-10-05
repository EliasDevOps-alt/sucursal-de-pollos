import { notifications } from '@mantine/notifications';
import { apiErrorMessage } from '../api/client';

export const notifyOk = (message: string) => notifications.show({ color: 'green', message });
export const notifyError = (error: unknown) =>
  notifications.show({ color: 'red', title: 'Error', message: apiErrorMessage(error) });
