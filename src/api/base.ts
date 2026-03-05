export interface ResponseApiBase<T> {
    data: T;
    response_code: number;
    description: string;
    token: string;
}
