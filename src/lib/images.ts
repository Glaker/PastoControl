/**
 * Achica una foto en el navegador antes de subirla (los celulares sacan fotos de varios MB).
 * Devuelve un JPEG. Usa <img>, que respeta la orientación EXIF en los navegadores actuales.
 */
export async function resizeImage(file: File, maxSide: number, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageReadError();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ImageReadError())), 'image/jpeg', quality),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export class ImageReadError extends Error {
  constructor() {
    super('No pudimos leer esa foto. Probá con otra (JPG o PNG).');
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageReadError());
    img.src = src;
  });
}
