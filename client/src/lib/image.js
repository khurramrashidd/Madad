/**
 * Shrink a photo to something safe to store in a database row.
 *
 * Avatars live in the user document rather than on disk, because the free
 * host's filesystem is ephemeral — anything written there disappears on the
 * next restart or deploy. That makes size the binding constraint: a modern
 * phone camera produces a 4 MB JPEG, and a few hundred of those would fill a
 * free Atlas tier on their own, as well as being read back on every feed
 * request that populates a user.
 *
 * So the browser does the work before anything is uploaded. A 256 px square
 * is more than an avatar ever renders at, and WebP at quality 0.8 brings a
 * camera photo down to roughly 15-40 KB — a hundredfold reduction, for an
 * image nobody can tell apart at 72 px.
 *
 * Doing it client-side also avoids shipping an image library to the server
 * and means a huge file is never uploaded at all, rather than uploaded and
 * then rejected.
 */

const MAX_EDGE = 256;
const QUALITY = 0.8;
/** Matches the server's cap, with headroom for base64's ~33% overhead. */
export const MAX_DATA_URI_LENGTH = 400_000;

/**
 * Centre-crops to a square, then scales down.
 *
 * Cropping rather than squashing: an avatar is rendered in a circle, and a
 * stretched face is worse than a cropped background.
 */
function drawSquare(source, width, height) {
  const edge = Math.min(width, height);
  const sx = (width - edge) / 2;
  const sy = (height - edge) / 2;
  const size = Math.min(edge, MAX_EDGE);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, edge, edge, 0, 0, size, size);
  return canvas;
}

function toDataUri(canvas) {
  // WebP where available — roughly 30% smaller than JPEG at the same quality.
  // Safari below 14 falls back to JPEG, which the server also accepts.
  const webp = canvas.toDataURL('image/webp', QUALITY);
  if (webp.startsWith('data:image/webp')) return webp;
  return canvas.toDataURL('image/jpeg', QUALITY);
}

/**
 * @param {File} file
 * @returns {Promise<string>} a data URI under MAX_DATA_URI_LENGTH
 * @throws {Error} with a message fit to show the user
 */
export async function compressImage(file) {
  if (!file) throw new Error('No image selected');
  if (!file.type?.startsWith('image/')) throw new Error('That file is not an image');
  // Guard before decoding: a 50 MP image can exhaust memory on a cheap phone
  // even though the output would have been small.
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('That image is very large — try one under 25 MB');
  }

  /**
   * createImageBitmap handles EXIF orientation and decodes off the main
   * thread, so a large photo does not freeze the UI. Older WebViews lack it,
   * hence the <img> path.
   */
  let canvas;
  if (typeof createImageBitmap === 'function') {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error('That image could not be read — try a different one');
    }
    try {
      canvas = drawSquare(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close?.();
    }
  } else {
    canvas = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          resolve(drawSquare(img, img.naturalWidth, img.naturalHeight));
        } catch (err) {
          reject(err);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('That image could not be read — try a different one'));
      };
      img.src = url;
    });
  }

  let uri = toDataUri(canvas);

  // Belt and braces: a noisy photo can still come out large. Step the quality
  // down rather than refusing an upload that is nearly small enough.
  for (let q = 0.65; uri.length > MAX_DATA_URI_LENGTH && q >= 0.4; q -= 0.12) {
    uri = canvas.toDataURL('image/webp', q);
    if (!uri.startsWith('data:image/webp')) uri = canvas.toDataURL('image/jpeg', q);
  }

  if (uri.length > MAX_DATA_URI_LENGTH) {
    throw new Error('That image is too detailed to store — try a simpler photo');
  }

  return uri;
}

export default compressImage;
