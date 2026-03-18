export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface ResponseApiBase<T> {
    data: T;
    responseCode: number;
    description: string;
    token: string;
}
