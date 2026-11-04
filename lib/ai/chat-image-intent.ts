export function requestsImageGeneration(message: string) {
  const text = message.trim();
  if (!text || /^(how|what|why|when|where)\b/i.test(text)) return false;
  const image = '(?:image|picture|photo|illustration|artwork|graphic|logo|wallpaper|poster)';
  return new RegExp(`\\b(?:generate|draw|illustrate|design)\\b.{0,50}\\b${image}\\b`, 'i').test(text) ||
    new RegExp(`\\b(?:create|make)\\s+(?:(?:me|a|an|the)\\s+){0,2}${image}\\b`, 'i').test(text);
}
