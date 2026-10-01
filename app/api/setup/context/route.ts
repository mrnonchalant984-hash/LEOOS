import {NextRequest,NextResponse} from 'next/server'; import {locationFromHeaders,countryLabel} from '@/lib/client-context';
export async function GET(req:NextRequest){const loc=locationFromHeaders(req.headers);return NextResponse.json({...loc,countryName:countryLabel(loc.country)});}
