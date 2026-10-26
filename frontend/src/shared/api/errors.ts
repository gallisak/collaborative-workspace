export interface ErrorBody {
  statusCode?: number;
  message?: string | string[];
  correlationId?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: string[] = [],
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static from(status: number, body: unknown): ApiError {
    const { message, correlationId } = (body ?? {}) as ErrorBody;
    const details = Array.isArray(message) ? message : [];
    const text =
      (Array.isArray(message) ? message[0] : message) ??
      (status >= 500 ? 'Something went wrong, please try again' : 'Request failed');
    return new ApiError(status, text, details, correlationId);
  }
}

export interface ApiResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

export function unwrap<T>({ data, error, response }: ApiResult<T>): T {
  if (!response.ok) {
    throw ApiError.from(response.status, error);
  }
  return data as T;
}
