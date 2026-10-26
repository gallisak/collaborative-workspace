import { checkImage } from './upload-image';

vi.mock('@/shared/api', () => ({ api: {}, unwrap: vi.fn() }));

const file = (type: string, size: number) => new File([new Uint8Array(size)], 'chart', { type });

describe('checkImage', () => {
  it('accepts supported images up to 1 MB', () => {
    expect(checkImage(file('image/png', 1024 * 1024))).toBeNull();
    expect(checkImage(file('image/webp', 10))).toBeNull();
  });

  it.each([
    [
      'an SVG that can carry scripts',
      file('image/svg+xml', 10),
      'Choose a PNG, JPEG, GIF or WebP image',
    ],
    ['a document', file('application/pdf', 10), 'Choose a PNG, JPEG, GIF or WebP image'],
    ['a large photo', file('image/jpeg', 1024 * 1024 + 1), 'Images can be up to 1 MB'],
  ])('rejects %s', (_, image, message) => {
    expect(checkImage(image)).toBe(message);
  });
});
