const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
type MediaType = (typeof ACCEPTED)[number];

const MAX_DIMENSION = 4000;
const MAX_BYTES = 4_500_000;

/** Base64-encode a pasted image, downscaling oversized ones via canvas. */
export async function encodeImage(
  file: File,
): Promise<{ mediaType: MediaType; data: string }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));

  if (scale < 1 || file.size > MAX_BYTES) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png'),
    );
    return { mediaType: 'image/png', data: await toBase64(blob) };
  }

  const mediaType = (ACCEPTED as readonly string[]).includes(file.type)
    ? (file.type as MediaType)
    : 'image/png';
  return { mediaType, data: await toBase64(file) };
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
