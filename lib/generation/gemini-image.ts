import { GoogleGenAI } from '@google/genai';

type ImageInput = { bytes: Buffer; mimeType: string };

export function isGeminiImageModel(model: string) {
  const id = model.replace(/^google\//, '').trim().toLowerCase();
  return /^imagen(?:-|$)/.test(id) || /^gemini-[^/]*image(?:-|$)/.test(id);
}

export function resolveGeminiImageModel(requested?: string) {
  const model = (requested?.trim() || process.env.LEO_GEMINI_IMAGE_MODEL?.trim() || 'gemini-2.5-flash-image-preview').replace(/^google\//, '');
  if (!isGeminiImageModel(model)) throw new Error(`Configured model "${model}" is text-capable and cannot generate or edit images. Set LEO_GEMINI_IMAGE_MODEL to a Gemini image or Imagen model.`);
  return model;
}

export async function generateGeminiImage(prompt: string, inputImage?: ImageInput, requestedModel?: string) {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) throw new Error('Gemini is not configured.');
  const model = resolveGeminiImageModel(requestedModel);
  const input = inputImage
    ? [
      { type: 'text' as const, text: prompt },
      { type: 'image' as const, mime_type: inputImage.mimeType, data: inputImage.bytes.toString('base64') },
    ]
    : prompt;
  const response = await new GoogleGenAI({ apiKey }).interactions.create({ model, input });
  const image = response.output_image;
  if (!image?.data) throw new Error('Gemini image generation returned no image data.');
  const mimeType = image.mime_type || 'image/png';
  if (!mimeType.startsWith('image/')) throw new Error('Gemini returned an unsupported image format.');
  const outputFormat = mimeType === 'image/jpeg' ? 'jpeg' : mimeType === 'image/webp' ? 'webp' : 'png';
  return {
    model,
    image: { b64_json: image.data, output_format: outputFormat },
  };
}
