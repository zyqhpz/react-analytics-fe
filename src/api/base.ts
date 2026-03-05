export interface ResponseApiBase<T> {
    data: T;
    responseCode: number;
    description: string;
    token: string;
}
