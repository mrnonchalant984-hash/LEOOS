import { NextRequest, NextResponse } from 'next/server';
import { LEO_TEMPLATES } from '@/data/website-templates';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim().toLowerCase() || '';
  const category = req.nextUrl.searchParams.get('category')?.trim().toLowerCase() || '';
  const templates = LEO_TEMPLATES.filter(template => {
    const haystack = [template.name, template.type, template.description, template.style, ...template.suitableFor].join(' ').toLowerCase();
    return (!q || haystack.includes(q)) && (!category || template.type.toLowerCase() === category);
  });
  return NextResponse.json({ templates, categories: [...new Set(LEO_TEMPLATES.map(template => template.type))] });
}
