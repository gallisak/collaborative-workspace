const SECRET_SEGMENTS = /(\/public\/documents\/)[^/?#]+/;

export const redactUrl = (url: string) => url.replace(SECRET_SEGMENTS, '$1[redacted]');
