import { GoogleGenAI, type Part } from '@google/genai';

type ImageInput = { bytes: Buffer; mimeType: string };

export function isGeminiImageModel(model: string) {
  const id = model.replace(/^google\//, '').trim().toLowerCase();
  return /^imagen(?:-|$)/.test(id) || /^gemini-[^/]*image(?:-|$)/.test(id) || /^gemini-nano-banana(?:-|$|\.)/.test(id);
}

export function resolveGeminiImageModel(requested?: string) {
  const model = (requested?.trim() || process.env.LEO_GEMINI_IMAGE_MODEL?.trim() || 'gemini-nano-banana-2.1').replace(/^google\//, '');
  if (!isGeminiImageModel(model)) throw new Error(`Configured model "${model}" is text-capable and cannot generate or edit images. Set LEO_GEMINI_IMAGE_MODEL to a Gemini image or Imagen model.`);
  return model;
}

export async function generateGeminiImage(prompt: string, inputImage?: ImageInput, requestedModel?: string) {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) throw new Error('Gemini is not configured.');
  const model = resolveGeminiImageModel(requestedModel);

  // Use Gemini's documented generateContent image response path. The previous
  // Interactions API implementation expected `output_image`, which is not the
  // stable response shape used by the Gemini image models in this project.
  const parts: Part[] = [{ text: prompt }];
  if (inputImage) {
    parts.push({ inlineData: { mimeType: inputImage.mimeType, data: inputImage.bytes.toString('base64') } });
  }
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '1:1', imageSize: '1K' },
      httpOptions: { timeout: 120_000 },
    },
  });

  const responseParts = response.candidates?.flatMap(candidate => candidate.content?.parts ?? []) ?? [];
  const generated = responseParts.find(part => part.inlineData?.data);
  const base64 = generated?.inlineData?.data;
  if (!base64) {
    const text = responseParts.map(part => part.text).filter(Boolean).join(' ').slice(0, 240);
    throw new Error(text || 'Gemini image generation returned no image data. Confirm the image model is enabled for this API key and billing project.');
  }
  const mimeType = generated?.inlineData?.mimeType || 'image/png';
  if (!mimeType.startsWith('image/')) throw new Error('Gemini returned an unsupported image format.');
  const outputFormat = mimeType === 'image/jpeg' ? 'jpeg' : mimeType === 'image/webp' ? 'webp' : 'png';
  return { model, image: { b64_json: base64, output_format: outputFormat } };
}
