type PrivateMediaResponse = {
  url?: unknown;
  error?: unknown;
};

function imageFile(blob: Blob): File {
  const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
  return new File([blob], `leo-generated-image.${extension}`, { type: blob.type || 'image/png' });
}

export async function sharePrivateImage(assetId: string): Promise<'shared' | 'copied'> {
  const response = await fetch(`/api/media/${encodeURIComponent(assetId)}`, { cache: 'no-store' });
  const body = await response.json() as PrivateMediaResponse;
  if (!response.ok || typeof body.url !== 'string') {
    throw new Error(typeof body.error === 'string' ? body.error : 'The image share link could not be created.');
  }

  const shareUrl = new URL(body.url);
  if (shareUrl.protocol !== 'https:' && shareUrl.origin !== window.location.origin) {
    throw new Error('The image share link is invalid.');
  }

  if (navigator.share) {
    if (navigator.canShare) {
      try {
        const imageResponse = await fetch(shareUrl);
        if (imageResponse.ok) {
          const file = imageFile(await imageResponse.blob());
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Image created with Leo AI' });
            return 'shared';
          }
        }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      }
    }

    await navigator.share({
      title: 'Image created with Leo AI',
      text: 'A generated image shared from Leo AI. This private link expires in one hour.',
      url: shareUrl.toString(),
    });
    return 'shared';
  }

  if (!navigator.clipboard?.writeText) {
    throw new Error('Sharing is not supported in this browser. Download the image to share it.');
  }
  await navigator.clipboard.writeText(shareUrl.toString());
  return 'copied';
}
